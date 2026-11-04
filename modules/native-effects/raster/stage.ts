import {defineNativeStage} from '../../native-gpu/authoring.ts';
import {linear709,type AlphaMode} from '../../../src/media/surface.ts';
import type {GpuPixelKernelSourceV1} from '../../gpu-effects/pixel-types.ts';
import {createNativeRasterEffects,nativeRasterEffectNames} from './filters.ts';
import {calls} from './cases.ts';
import {keyframes} from '../../../src/core/animation.ts';
export const rasterSeed:GpuPixelKernelSourceV1={abiVersion:1,id:'fixture/native-raster-seed',version:'1.0.0',inputCount:0,parameterWords:3,code:`
fn pixel(p:vec2u)->vec4f{let side=paramU32(1u);let q=(p.x+3u*p.y+side)%7u;let a=select(f32(q)/6.,1.,paramU32(0u)==2u);
 var rgb=vec3f(2.5+f32(p.x%3u)*.125,-.25-f32(p.y%3u)*.25,.125+f32(side)*.25);
 if(paramU32(0u)==0u){rgb*=a;}return vec4f(rgb,a);}`};
interface Props {alpha?:AlphaMode;format?:'rgba16float'|'rgba32float';chain?:boolean;special?:boolean;only?:number}
export const rasterStage=defineNativeStage<Record<string,never>,Props>(init=>{const g=init.gpu,processor=createNativeRasterEffects(init);return {async renderAt(context,_inputs,props){
 const alpha=props.alpha??'premultiplied',format=props.format??'rgba32float',kernel=await g.compile(rasterSeed),meta={width:init.width-(props.only===96?3:0),height:init.height-(props.only===96?2:0),format,alpha,color:linear709},a=await g.run(kernel,[],{parameters:Uint32Array.of(alpha==='premultiplied'?0:alpha==='straight'?1:2,0,0),output:meta}),b=await g.run(kernel,[],{parameters:Uint32Array.of(alpha==='premultiplied'?0:alpha==='straight'?1:2,1,0),output:meta});
 if(props.special){const before=g.stats().runs,abort=AbortSignal.abort();
  const different={...linear709,primaries:'acescg' as const,whitePoint:'D60' as const};
  await processor.processImage(a,async(input,f)=>{for(const [request,code] of [[()=>f.fill(input,{signal:abort}),'E_RENDER_CANCELLED'],[()=>f.blur(input,{radius:-1}),'E_GPU_IMAGE_PARAMETER'],[()=>f.exposure(input,{stops:10000}),'E_GPU_IMAGE_UNSUPPORTED'],[()=>f.tile(input,{width:0}),'E_GPU_IMAGE_PARAMETER'],[()=>f.fill(input,{maxBufferBytes:1024}),'E_GPU_IMAGE_BUDGET'],[()=>f.fill(input,{alpha:'opaque'}),'E_NATIVE_EFFECTS_ALPHA'],[()=>f.over(input,b,{alpha:'opaque'}),'E_NATIVE_EFFECTS_ALPHA'],[()=>f.exposure(input,{workingColor:{...different,transfer:'srgb'}}),'E_GPU_IMAGE_COLOR'],[async()=>g.run(await g.compile({abiVersion:1,id:'fixture/native-color-gap',version:'1.0.0',inputCount:1,parameterWords:0,code:'fn pixel(p:vec2u)->vec4f{return read0(vec2i(p));}'}),[input],{output:{color:different}}),'E_NATIVE_SCOPE']] as const){try{await request();throw Error('Expected preflight rejection');}catch(e){if((e as {code?:string}).code!==code)throw e;}}if(g.stats().runs!==before)throw Error('Rejected parameters recorded work');return input;});
 }
 const result=await processor.processImage(a,async(input,f)=>{if(props.chain){let v=await f.exposure(input,{stops:.7});v=await f.offsetRGB(v,{offset:[.37,-.25,1.125]});v=await f.screen(v,b,{opacity:.71300000001});return f.crossfade(v,b,{mix:.71300000001});}
  if(props.only===99)return f.fill(input,{opacity:keyframes([{frame:0,value:.2},{frame:10,value:.8}]),color:[3,-.5,.75]});
  if(props.only===97)return f.dropShadow(input,{offset:[Number.MAX_SAFE_INTEGER,0]});
  if(props.only===96)return f.reframe(input,{x:-2,y:1,width:init.width,height:init.height});
  if(props.only===95)return f.fill(input,{color:[3,-.5,.75],alpha:'opaque'});
  const name=nativeRasterEffectNames[(props.only??context.globalFrame)%nativeRasterEffectNames.length];return calls[name](f,input,b);
 },{context});
 if(props.only===95&&result.info.alpha!=='opaque')throw Error('Proven opaque publication lost metadata');
 // Diagnostic raw snapshot, not a colour conversion/public data contract.
 // Keep BOTH seeds live through this pass, avoiding liveness reuse before
 // the independent diagnostic executable reads their original allocations.
 return g.run(await g.compile({abiVersion:1,id:'fixture/native-raster-capture',version:'1.0.0',inputCount:3,parameterWords:1,code:'fn pixel(p:vec2u)->vec4f{if(paramU32(0u)==1u){return read1(vec2i(p));}if(paramU32(0u)==2u){return read2(vec2i(p));}return read0(vec2i(p));}'}),[result,a,b],{parameters:Uint32Array.of(0),output:{format:'rgba32float',alpha:'premultiplied'}});
 },dispose:()=>processor.dispose()};});
/** Editable creation chain. All images and scratch remain in this Native Stage. */
export const rasterScene=defineNativeStage<Record<string,never>,Record<string,never>>(init=>{const g=init.gpu,processor=createNativeRasterEffects(init);return {async renderAt(c){
 const source=await g.run(await g.compile({...rasterSeed,id:'example/native-raster-seed'}),[],{parameters:Uint32Array.of(0,0,0),output:{width:init.width,height:init.height,format:'rgba32float',alpha:'premultiplied',color:linear709}});
 return processor.processImage(source,async(input,f)=>{const shape=await f.fill(input,{color:[2.5,-.25,.5]}),soft=await f.feather(input,{radius:1.25}),masked=await f.applyMatte(shape,soft),shadow=await f.dropShadow(masked,{radius:2,offset:[4.25,3.5],color:[.15,.35,1.5]}),combined=await f.over(masked,shadow),bloom=await f.glow(combined,{radius:1,threshold:.5,intensity:.4}),exposed=await f.exposure(bloom,{stops:keyframes([{frame:0,value:0},{frame:119,value:.4},{frame:239,value:.1}])});return f.offsetRGB(exposed,{offset:[-.1,.03,.02]});},{context:c});
 },dispose:()=>processor.dispose()};});
