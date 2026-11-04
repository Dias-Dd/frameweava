import {EngineError} from '../../../src/core/errors.ts';
import {linear709,acescg,type AlphaMode} from '../../../src/media/surface.ts';
import {defineNativeStage,type NativeStageInit,type NativeGpuScope} from '../../native-gpu/authoring.ts';
import {borrowNativeScope} from '../../native-gpu/borrow.ts';
import {createNativeBuiltinEffects,nativeBuiltinEffectNames} from './filters.ts';
import type {GpuPixelImage} from '../../gpu-effects/pixel-types.ts';
import type {FrameContext} from '../../../src/core/types.ts';
import {callBuiltin,transformOptions} from './cases.ts';
import {seedKernel} from '../pa/stage.ts';
import {sceneSource} from '../pa/scene-options.ts';
async function publish(g:NativeGpuScope,id:string,image:GpuPixelImage){const view=await g.imageToBuffer!(image,{version:1});await g.publishBuffer(id,view,{version:1});await g.releaseBuffer(view);}
interface Props {format?:'rgba16float'|'rgba32float';alpha?:AlphaMode;wide?:boolean;only?:number;defaults?:boolean;chain?:boolean;reference?:boolean;preflight?:boolean;color?:boolean;counter?:'screen'|'opacity'}
async function make(init:NativeStageInit,borrowed=false){const g=init.gpu,loan=borrowed?borrowNativeScope(g):undefined,fx=createNativeBuiltinEffects({gpu:loan?.scope??g});let failed=false;
 return {async renderAt(c:FrameContext,_i:Record<string,never>,p:Props){const format=p.format??'rgba32float',alpha=p.alpha??'premultiplied',color=p.color?acescg:linear709,seed=await g.compile({...seedKernel,id:'fixture/native-builtin-seed'});
 let a=p.chain?await sceneSource(g,init.width,init.height,c):await g.run(seed,[],{parameters:Uint32Array.of(alpha==='premultiplied'?0:alpha==='straight'?1:2,Number(p.wide),Number(p.wide)),output:{width:init.width,height:init.height,format,alpha,color}}),b=await g.run(seed,[],{parameters:Uint32Array.of(alpha==='premultiplied'?0:alpha==='straight'?1:2,0,0),output:{...a.info,color:linear709}});
 if(p.counter){const counter=await g.compile({abiVersion:1,id:'fixture/native-builtin-counter',version:'1.0.0',inputCount:0,parameterWords:1,code:'fn pixel(p:vec2u)->vec4f{return vec4f(vec3f(paramF32(0u)),1.);}'});a=await g.run(counter,[],{parameters:Float32Array.of(p.counter==='screen'?1+2**-16:65504),output:{...a.info,alpha:'opaque'}});b=await g.run(counter,[],{parameters:Float32Array.of(p.counter==='screen'?65504:0),output:{...a.info,alpha:'opaque'}});}
 if(p.preflight){if(c.globalFrame===0&&!failed){failed=true;return fx.processImage(a,async(i,f)=>{await f.blur(i,{radius:80});throw new EngineError('E_NATIVE_BUILTIN_FIXTURE','Failure after typed Gaussian weights recorded');});}
  const before=g.stats().runs;await fx.processImage(a,async(i,f)=>{for(const [request,code]of [[()=>f.blur(i,{radius:201}),'E_NATIVE_BUILTIN_PARAMETER'],[()=>f.transform(i,{scale:0}),'E_NATIVE_BUILTIN_PARAMETER'],[()=>f.mix(i,b,{mode:'overlay' as never}),'E_NATIVE_BUILTIN_PARAMETER'],[()=>f.glow(i,{intensity:6}),'E_NATIVE_BUILTIN_PARAMETER'],[()=>f.brightness(i,{amount:NaN}),'E_NATIVE_BUILTIN_PARAMETER'],[()=>f.cinematicGlow(i,{color:7 as never}),'E_NATIVE_BUILTIN_PARAMETER'],[()=>f.blur(i,{signal:AbortSignal.abort()}),'E_RENDER_CANCELLED']] as const){try{await request();throw Error('Accepted invalid '+code);}catch(e){if((e as {code?:string}).code!==code)throw e;}}return i;});if(g.stats().runs!==before)throw Error('Invalid work recorded');}
 const result=await fx.processImage(a,async(i,f)=>{if(p.counter)return f.mix(i,b,{mode:p.counter==='screen'?'screen':'source-over',opacity:p.counter==='screen'?1:.99999999});if(p.chain){let v=await f.transform(i,{...transformOptions,format}),bright=await f.brightness(v,{amount:1.1,format});v=await f.mix(i,bright,{mode:'screen',opacity:.4,format});return f.cinematicGlow(v,{intensity:.35,format});}const frame=p.only??c.globalFrame,name=nativeBuiltinEffectNames[frame%7];return callBuiltin(name,f,i,b,c,Math.floor(frame/7),p.defaults);},{context:c});
 const stats=fx.stats();if(stats.createdDataBuffers!==stats.releasedDataBuffers)throw Error('Builtin data scratch leaked');
 if(p.reference){await publish(g,'sourceA',a);await publish(g,'sourceB',b);await publish(g,'result',result);}return result;
 },async dispose(){await fx.dispose();await fx.dispose();await loan?.dispose();await loan?.dispose();}};
}
export const builtinStage=defineNativeStage<Record<string,never>,Props>(init=>make(init));
export const builtinBorrowed=defineNativeStage<Record<string,never>,Props>(init=>make(init,true));
