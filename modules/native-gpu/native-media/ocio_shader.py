"""Export reviewed built-in OCIO GPU instructions, never process frame pixels."""
import sys,json,hashlib
import PyOpenColorIO as o
r=json.load(open(sys.argv[1],encoding='utf-8'))
if o.__version__!='2.5.2':raise ValueError('Native GPU OCIO profile is qualified with 2.5.2 only')
name=r.get('config','cg-config-v4.0.0_aces-v2.0_ocio-v2.5')
if name not in ['cg-config-v4.0.0_aces-v2.0_ocio-v2.5','studio-config-v4.0.0_aces-v2.0_ocio-v2.5']:raise ValueError('Pinned built-in config required')
c=o.Config.CreateFromBuiltinConfig(name)
if r.get('display'):
 t=o.DisplayViewTransform();t.setSrc(r['source']);t.setDisplay(r['display']);t.setView(r['view']);p=c.getProcessor(t)
else:p=c.getProcessor(r['source'],r['destination'])
g=p.getDefaultGPUProcessor();d=o.GpuShaderDesc.CreateShaderDesc();d.setLanguage(o.GPU_LANGUAGE_HLSL_DX11);d.setFunctionName('fw_ocio');d.setResourcePrefix('fw_ocio_');d.setAllowTexture1D(False);g.extractGpuShaderInfo(d)
if len(list(d.get3DTextures())):raise ValueError('3D OCIO LUT profiles are not admitted by native media v1')
textures=[];code=d.getShaderText()
code=code.replace('atan2(', 'fw_atan2(')
code='float fw_atan2(float y,float x){float ax=abs(x),ay=abs(y);if(max(ax,ay)==0.)return 0.;float t=min(ax,ay)/max(ax,ay);bool r=t>0.4142135623730951;if(r)t=(t-1.)/(t+1.);precise float q=t*t;precise float a=t*(1.+q*(-1./3.+q*(1./5.+q*(-1./7.+q*(1./9.+q*(-1./11.+q*(1./13.+q*(-1./15.+q*(1./17.+q*(-1./19.+q/21.))))))))));if(r)a+=.7853981633974483;if(ay>ax)a=1.5707963267948966-a;if(x<0.)a=3.1415926535897932-a;return y<0.?-a:a;}\n'+code
# Match the hue-axis convention in OCIO's CPU implementation as well.
code=code.replace('(Aab.g == 0.0) ? 0.0 : fw_atan2(Aab.b, Aab.g)', 'fw_atan2(Aab.b, Aab.g)')
for i,t in enumerate(d.getTextures()):
 if i>=8:raise ValueError('OCIO texture binding budget')
 channels=1 if t.channel==o.GpuShaderDesc.TextureType.TEXTURE_RED_CHANNEL else 3
 values=[float(v) for v in t.getValues()]
 if len(values)!=t.width*t.height*channels:raise ValueError('Unexpected OCIO LUT data layout')
 textures.append(dict(width=t.width,height=t.height,channels=channels,linear=t.interpolation==o.INTERP_LINEAR,values=values))
 code=code.replace('Texture2D '+t.textureName+';','Texture2D '+t.textureName+':register(t'+str(i)+');').replace('SamplerState '+t.samplerName+';','SamplerState '+t.samplerName+':register(s'+str(i)+');')
json.dump(dict(version=1,shader=code,textures=textures,provenance=dict(ocioVersion=o.__version__,shaderAdaptation="float32-atan2-v1",config=name,configSha256=hashlib.sha256(c.serialize().encode()).hexdigest(),processorCacheID=p.getCacheID(),gpuProcessorCacheID=g.getCacheID())),sys.stdout)
