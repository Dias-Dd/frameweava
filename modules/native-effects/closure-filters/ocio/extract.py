"""Reviewed offline OCIO GPU extraction / independent CPU oracle. No GPU host."""
import json, sys, hashlib, os
import PyOpenColorIO as ocio
def make_processor(r):
    config=ocio.Config.CreateFromFile(r['config']) if os.path.isfile(r['config']) else ocio.Config.CreateFromBuiltinConfig(r['config'])
    dynamic=r.get('dynamicProperties',[])
    allowed=['exposure-contrast','grading-primary','grading-rgb-curve']
    if not isinstance(dynamic,list) or len(set(dynamic))!=len(dynamic) or any(v not in allowed for v in dynamic): raise ValueError('Invalid explicit dynamicProperties')
    found=set()
    def mark(transform):
        if isinstance(transform,ocio.GroupTransform):
            result=ocio.GroupTransform(direction=transform.getDirection())
            for item in transform: result.appendTransform(mark(item))
            return result
        elif isinstance(transform,ocio.ExposureContrastTransform) and 'exposure-contrast' in dynamic:
            transform.makeExposureDynamic(); transform.makeContrastDynamic(); transform.makeGammaDynamic(); found.add('exposure-contrast')
        elif isinstance(transform,ocio.GradingPrimaryTransform) and 'grading-primary' in dynamic:
            transform.makeDynamic(); found.add('grading-primary')
        elif isinstance(transform,ocio.GradingRGBCurveTransform) and 'grading-rgb-curve' in dynamic:
            transform.makeDynamic(); found.add('grading-rgb-curve')
        return transform
    # Mark the configuration BEFORE creating a Processor. Identity static
    # grading transforms may otherwise already have been eliminated by OCIO.
    if dynamic:
        for look in list(config.getLooks()):
            for getter,setter in [('getTransform','setTransform'),('getInverseTransform','setInverseTransform')]:
                transform=getattr(look,getter)()
                if transform is not None: getattr(look,setter)(mark(transform))
            config.addLook(look)
        for space in list(config.getColorSpaces(ocio.SEARCH_REFERENCE_SPACE_ALL,ocio.COLORSPACE_ALL)):
            for direction in [ocio.COLORSPACE_DIR_TO_REFERENCE,ocio.COLORSPACE_DIR_FROM_REFERENCE]:
                transform=space.getTransform(direction)
                if transform is not None: space.setTransform(mark(transform),direction)
            config.addColorSpace(space)
        for view in list(config.getViewTransforms()):
            for direction in [ocio.VIEWTRANSFORM_DIR_TO_REFERENCE,ocio.VIEWTRANSFORM_DIR_FROM_REFERENCE]:
                transform=view.getTransform(direction)
                if transform is not None: view.setTransform(mark(transform),direction)
            config.addViewTransform(view)
        for named in list(config.getNamedTransforms()):
            for direction in [ocio.TRANSFORM_DIR_FORWARD,ocio.TRANSFORM_DIR_INVERSE]:
                transform=named.getTransform(direction)
                if transform is not None: named.setTransform(mark(transform),direction)
            config.addNamedTransform(named)
    if any(v not in found for v in dynamic): raise ValueError('Explicit dynamic property has no corresponding processor transform')
    group=ocio.GroupTransform()
    operation=r['operation']
    if operation=='color-space': group.appendTransform(config.getProcessor(r['source'],r['destination']).createGroupTransform())
    elif operation=='display':
        group.appendTransform(config.getProcessor(ocio.DisplayViewTransform(src=r['source'],display=r['display'],view=r['view'])).createGroupTransform())
        # Remove display encoding explicitly, never relabel as scene-linear.
        group.appendTransform(config.getProcessor(r['display'],r['linearDisplaySpace']).createGroupTransform())
    elif operation=='file': group.appendTransform(ocio.FileTransform(src=r['file'],interpolation=ocio.INTERP_LINEAR))
    elif operation=='look': group.appendTransform(ocio.LookTransform(src=r['source'],dst=r['destination'],looks=r['look']))
    else: raise ValueError('Unsupported operation')
    return config,config.getProcessor(group)
def extract(r):
    config,processor=make_processor(r)
    shader=ocio.GpuShaderDesc.CreateShaderDesc()
    shader.setLanguage(ocio.GPU_LANGUAGE_GLSL_4_0)
    shader.setFunctionName('ocio_apply')
    shader.setResourcePrefix('ocio_')
    # Keep the same operation ordering as the independent CPU oracle. The
    # default optimizer may fold/reassociate matrices or cancel display pairs.
    processor.getOptimizedGPUProcessor(ocio.OPTIMIZATION_NONE).extractGpuShaderInfo(shader)
    uniforms=[]
    for name,data in shader.getUniforms():
        if data.type==ocio.UNIFORM_DOUBLE:
            kind='float'; value=float(data.getDouble())
            # Official NoClamp uses +/-DBL_MAX although the GPU uniform is F32.
            # For the finite-F32 execution domain, +/-FLT_MAX is equivalent and
            # avoids an infinite control word. No pixel/HDR value is truncated.
            if name=='ocio_grading_primary_clampBlack' and value==-sys.float_info.max: value=-3.4028234663852886e38
            if name=='ocio_grading_primary_clampWhite' and value==sys.float_info.max: value=3.4028234663852886e38
            values=[value]
        elif data.type==ocio.UNIFORM_BOOL: kind='bool'; values=[bool(data.getBool())]
        elif data.type==ocio.UNIFORM_FLOAT3: kind='float3'; values=[float(v) for v in data.getFloat3()]
        elif data.type==ocio.UNIFORM_VECTOR_FLOAT: kind='float-array'; values=[float(v) for v in data.getVectorFloat()]
        elif data.type==ocio.UNIFORM_VECTOR_INT: kind='int-array'; values=[int(v) for v in data.getVectorInt()]
        else: raise ValueError('Unsupported official uniform type: '+str(data.type))
        uniforms.append(dict(symbol=name,type=kind,values=values))
    textures=[]
    for texture in shader.getTextures():
        if texture.interpolation not in [ocio.INTERP_LINEAR,ocio.INTERP_NEAREST]: raise ValueError('Unsupported OCIO texture interpolation')
        channels=1 if 'RED_CHANNEL' in str(texture.channel) else 3
        dimension=1 if 'TEXTURE_1D' in str(texture.dimensions) else 2
        textures.append(dict(edge=0,width=texture.width,height=texture.height,dimension=dimension,channels=channels,sampler=texture.samplerName,texture=texture.textureName,interpolation='nearest' if texture.interpolation==ocio.INTERP_NEAREST else 'linear',values=[float(v) for v in texture.getValues()]))
    for texture in shader.get3DTextures():
        if texture.interpolation not in [ocio.INTERP_LINEAR,ocio.INTERP_NEAREST]: raise ValueError('Unsupported OCIO texture interpolation')
        textures.append(dict(edge=texture.edgeLen,width=texture.edgeLen,height=texture.edgeLen,dimension=3,channels=3,sampler=texture.samplerName,texture=texture.textureName,interpolation='nearest' if texture.interpolation==ocio.INTERP_NEAREST else 'linear',values=[float(v) for v in texture.getValues()]))
    files=[]
    for item in processor.getProcessorMetadata().getFiles():
        files.append(str(item))
    return dict(ocioVersion=ocio.__version__,configText=config.serialize(),cacheId=processor.getCacheID(),glsl=shader.getShaderText(),textures=textures,uniforms=uniforms,files=files)
def main():
    r=json.load(open(sys.argv[1],encoding='utf-8'))
    if r.get('mode')=='reference':
        import numpy as np
        _,p=make_processor(r)
        values=np.fromfile(r['input'],dtype=np.float32).reshape((-1,3))
        cpu=p.getOptimizedCPUProcessor(ocio.OPTIMIZATION_NONE)
        for j in range(len(values)): values[j]=cpu.applyRGB(values[j].tolist())
        values.tofile(r['output']);result=dict(samples=len(values),cacheId=p.getCacheID())
    else: result=extract(r)
    print(json.dumps(result,allow_nan=False))
if __name__=='__main__': main()
