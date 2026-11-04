/** Incremental prepared-data v2 adapter. v1 validation/preparation/execution is
 * delegated byte-for-byte to runtime.ts. Both versions use the same GPU scope. */
import type {NativeStageInit,NativeGpuScope} from '../../../native-gpu/authoring.ts';
import type {GpuDataBuffer,GpuComputeBinding} from '../../../gpu-effects/compute-types.ts';
import type {GpuPixelImage} from '../../../gpu-effects/pixel-types.ts';
import type {FrameContext} from '../../../../src/core/types.ts';
import {validatePixelKernel} from '../../../gpu-effects/pixel-shader.ts';
import {nativePixelInfo} from '../../../native-gpu/image-info.ts';
import {nativeWorkingImage} from '../../color.ts';
import {parameters,fail} from '../control.ts';
import type {OcioDefinition,OcioKind,OcioOptions,NativeDisplayData} from '../types.ts';
import {validateUniforms,uniformWords,type OcioUniformValues} from './uniforms.ts';
import {validateOcio as validateV1,prepareNativeOcio as prepareV1,runNativeOcio as runV1} from './runtime.ts';

export function validateOcio(d:OcioDefinition){
 if(!d||d.schemaVersion!==2)return validateV1(d);
 validatePixelKernel(d.kernel);
 if(!d.provenance||!/^[0-9a-f]{64}$/.test(d.provenance.uniformSha256??'')||d.kernel.dataInputs.map(v=>v.type).join(',')!=='f32,f32,f32,u32')fail('ocio','uniforms','sealed four-input dynamic processor');
 validateUniforms(d.uniforms??[]);
 const {uniforms:_uniforms,provenance,...base}=d,{uniformSha256:_seal,...staticProvenance}=provenance;
 // Reuse every existing identity/colour/resource check, then validate the actual
 // fourth input above. No v1 object, shader or execution is modified.
 validateV1({...base,schemaVersion:1,kernel:{...d.kernel,dataInputs:d.kernel.dataInputs.slice(0,3)},provenance:staticProvenance});
 if(Array.from(d.provenance.resources).some(r=>!r))fail('ocio','provenance.resources','dense sealed resource list');
}
export async function prepareNativeOcio(init:Pick<NativeStageInit,'gpu'>,definitions:readonly OcioDefinition[]){
 const legacy=await prepareV1(init,definitions.filter(d=>d?.schemaVersion!==2)),map=new Map<OcioDefinition,{data:GpuDataBuffer;defaults:GpuDataBuffer}>(),g=init.gpu;let closed=false;
 const digest=async(v:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',v as Uint8Array<ArrayBuffer>))).map(x=>x.toString(16).padStart(2,'0')).join('');
 const release=async(item:{data:GpuDataBuffer;defaults:GpuDataBuffer})=>{try{await g.releaseBuffer(item.defaults);}finally{await g.releaseBuffer(item.data);}};
 const item=(d:OcioDefinition)=>{if(closed)fail('ocio','lifecycle','open module');const v=map.get(d);if(!v)fail('ocio','processor','unmodified definition explicitly prepared during Stage init');return v;};
 try{
  for(const d of definitions){if(d.schemaVersion!==2||map.has(d))continue;validateOcio(d);
   if(await digest(new TextEncoder().encode(d.kernel.code))!==d.provenance.wgslSha256||await digest(new Uint8Array(Float32Array.from(d.lutValues).buffer))!==d.provenance.lutSha256||await digest(new TextEncoder().encode(JSON.stringify(d.uniforms)))!==d.provenance.uniformSha256)fail('ocio','integrity','unchanged prepared WGSL, LUT and dynamic layout/default bytes');
   const freeze=(v:unknown):void=>{if(v&&typeof v==='object'&&!Object.isFrozen(v)){for(const x of Object.values(v))freeze(x);Object.freeze(v);}};freeze(d);
   const max=Math.min(g.capabilities().limits.maxBufferSize,g.capabilities().limits.maxStorageBufferBindingSize),wordCount=validateUniforms(d.uniforms!);if(d.lutValues.length*4>max||wordCount*4>max)fail('ocio','storage','tables and uniform words within actual device limits');const words=uniformWords(d.uniforms!,undefined,undefined);
   const data=await g.createBuffer({type:'f32',length:d.lutValues.length},Float32Array.from(d.lutValues));try{const defaults=await g.createBuffer({type:'u32',length:words.length},words);map.set(d,{data,defaults});}catch(e){await g.releaseBuffer(data);throw e;}
  }
  return {legacy,get(d:OcioDefinition){return d.schemaVersion===1?legacy.get(d):item(d).data;},
   async uniformBinding(d:OcioDefinition,values:OcioUniformValues|undefined,context:FrameContext|undefined){const entry=item(d);if(values===undefined)return {buffer:entry.defaults,temporary:false};const words=uniformWords(d.uniforms!,values,context);return {buffer:await g.createBuffer({type:'u32',length:words.length},words),temporary:true};},
   async dispose(){if(closed)return;closed=true;try{for(const value of map.values())await release(value);map.clear();}finally{await legacy.dispose();}},
  };
 }catch(e){try{for(const value of map.values())await release(value);}finally{await legacy.dispose();}throw e;}
}

type Prepared=Awaited<ReturnType<typeof prepareNativeOcio>>;
type Common=[image:GpuPixelImage,d:OcioDefinition,o:OcioOptions,context:FrameContext|undefined,outer:AbortSignal|undefined];
export function runNativeOcio(g:NativeGpuScope,prepared:Prepared,kind:'display',...args:Common):Promise<NativeDisplayData>;
export function runNativeOcio(g:NativeGpuScope,prepared:Prepared,kind:Exclude<OcioKind,'display'>,...args:Common):Promise<GpuPixelImage>;
export async function runNativeOcio(g:NativeGpuScope,prepared:Prepared,kind:OcioKind,image:GpuPixelImage,d:OcioDefinition,o:OcioOptions,context?:FrameContext,outer?:AbortSignal):Promise<GpuPixelImage|NativeDisplayData>{
 if(d.schemaVersion!==2)return kind==='display'?runV1(g,prepared.legacy,'display',image,d,o,context,outer):runV1(g,prepared.legacy,kind,image,d,o,context,outer);
 const p=parameters('ocio'+kind,context,outer);p.fields(o,['uniforms']);const lut=prepared.get(d);if(d.operation!==kind)fail('ocio','processor.operation',kind);if(o.workingColor!==undefined)fail('ocio','workingColor','processor-declared input/output; no relabeling');if(!g.imageToBuffer)fail('ocio','gpu','Native readonly image-data v1');
 const source=await nativeWorkingImage(g,image,d.inputColor,o.signal??outer),base=await nativeWorkingImage(g,source,{...d.outputColor,reference:'scene'},o.signal??outer),a=await g.imageToBuffer(source,{version:1,signal:o.signal??outer});let b:GpuDataBuffer|undefined,dynamic:Awaited<ReturnType<Prepared['uniformBinding']>>|undefined;
 try{b=await g.imageToBuffer(base,{version:1,signal:o.signal??outer});dynamic=await prepared.uniformBinding(d,o.uniforms,context);const data=[a,lut,b,dynamic.buffer],parameters=new Uint32Array(128);parameters.set([source.info.alpha==='premultiplied'?0:1,0,source.info.width,source.info.height]);new Float32Array(parameters.buffer)[1]=p.scalar(o.amount,1,'amount',0,1);
  if(kind==='display'){
   const n=source.info.width*source.info.height*4;if(n*4>Math.min(g.capabilities().limits.maxBufferSize,g.capabilities().limits.maxStorageBufferBindingSize))fail('ocio','output','display data within actual device limits');
   const buffer=await g.createField({type:'f32',dimensions:[source.info.width,source.info.height,1],components:4,semantic:'generic',space:'image',units:'linear-display-rgb',channels:['r','g','b','a'],metadata:{kind:'native-ocio-display-data',schemaVersion:1,alpha:'premultiplied',logicalFormat:o.format??image.info.format,color:{primaries:d.outputColor.primaries,whitePoint:d.outputColor.whitePoint,transfer:'linear',reference:'display',range:'full',referenceWhiteNits:d.outputColor.referenceWhiteNits}}});
   try{let code=d.kernel.code.replace(/data([0123])\(/g,'load$1(').replace(/outputSize\(\)/g,'vec2u(paramU32(2u),paramU32(3u))').replace('fn pixel(','fn ocio_pixel(');
    code+='\nfn compute(p:vec3u,_l:vec3u,_g:vec3u){var v=ocio_pixel(p.xy);'+(o.format==='rgba16float'||o.format===undefined&&image.info.format==='rgba16float'?'v=vec4f(unpack2x16float(pack2x16float(v.xy)),unpack2x16float(pack2x16float(v.zw)));':'')+'let i=(p.y*paramU32(2u)+p.x)*4u;store4(i,v.r);store4(i+1u,v.g);store4(i+2u,v.b);store4(i+3u,v.a);}';
    const bindings:GpuComputeBinding[]=[{type:'f32',access:'read'},{type:'f32',access:'read'},{type:'f32',access:'read'},{type:'u32',access:'read'},{type:'f32',access:'read_write'}];
    await g.dispatch(await g.compileCompute({abiVersion:1,id:d.kernel.id+'/display-'+(o.format??image.info.format),version:'1.0.0',bindings,parameterWords:128,workgroupSize:[8,8,1],code}),[...data,buffer],{parameters,workItems:[source.info.width,source.info.height,1],signal:o.signal??outer});return Object.freeze({kind:'native-ocio-display-data',schemaVersion:1,width:source.info.width,height:source.info.height,encoding:'f32-rgba-interleaved',logicalFormat:o.format??image.info.format,alpha:'premultiplied',color:d.outputColor,buffer});
   }catch(e){await g.releaseBuffer(buffer);throw e;}
  }
  return await g.run(await g.compile(d.kernel),[],{output:nativePixelInfo({...source.info,color:d.outputColor,alpha:'premultiplied',format:o.format??image.info.format},g.capabilities()),parameters,data,signal:o.signal??outer});
 }finally{try{if(dynamic?.temporary)await g.releaseBuffer(dynamic.buffer);}finally{try{await g.releaseBuffer(a);}finally{if(b)await g.releaseBuffer(b);}}}
}
