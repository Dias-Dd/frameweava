import {EngineError} from '../../src/core/errors.ts';
import type {FrameContext} from '../../src/core/types.ts';
import type {NativeStageInit,NativeGpuScope} from '../native-gpu/authoring.ts';
import type {GpuPixelImage} from '../gpu-effects/pixel-types.ts';
import type {GpuDataBuffer} from '../gpu-effects/compute-types.ts';
import {createCreativeFilters} from '../gpu-image-effects/resident/creative/filters.ts';
import {createBlendFilters} from '../gpu-image-effects/resident/blends/filters.ts';
import type {CreativeFilters} from '../gpu-image-effects/resident/creative/types.ts';
import type {BlendFilters} from '../gpu-image-effects/resident/blends/types.ts';

export type NativeImageFilters=CreativeFilters&BlendFilters;
export type NativeImageRecipe=(input:GpuPixelImage,effects:NativeImageFilters)=>Promise<GpuPixelImage>;
export interface NativeImageProcessOptions {context?:FrameContext;signal?:AbortSignal}
export const nativeImageEffectNames=[
 'brightnessContrast','tint','tritone','colorBalance','blackAndWhite','filmGrain',
 'vignette','sobelEdges','reliefLighting','pixelate',
 'darken','lighten','difference','exclusion','overlay','hardLight',
 'linearBurn','subtractBlend','linearLight','pinLight',
] as const satisfies readonly (keyof NativeImageFilters)[];

/** Lifecycle adapter only. Native/R1 supplies the existing admitted (and, for
 * modules, already borrowed) scope. Never creates/disposes its device or owner.
 * Original effect functions, kernels, parameters and Half publications are used
 * unchanged. The ordinary Web/Surface API remains separate and unchanged. */
export function createNativeImageEffects(init:Pick<NativeStageInit,'gpu'>){
 return createNativeRecipeProcessor<NativeImageFilters>(init,(gpu,context,track,signal)=>({...createCreativeFilters(gpu,context,track,signal),...createBlendFilters(gpu,context,track,signal)}));
}
/** Shared lifecycle, not another renderer. The factory supplies original typed
 * algorithms. Scratch release is idempotent only for this recipe's own images,
 * matching the original Web scope; foreign and expired ownership still fails. */
export function createNativeRecipeProcessor<Filters>(init:Pick<NativeStageInit,'gpu'>,factory:(gpu:NativeGpuScope,context:FrameContext|undefined,track:(image:GpuPixelImage)=>GpuPixelImage,signal:AbortSignal|undefined)=>Filters){
 const gpu=init?.gpu,capabilities=gpu?.capabilities();
 if(!gpu||capabilities?.backend!=='native-wgpu'||capabilities.hardwareVerified!==true)
  throw new EngineError('E_NATIVE_EFFECTS_DEVICE','A hardware-admitted Native Stage or Native R1 borrowed scope is required');
 let closed=false,pending:Promise<GpuPixelImage>|undefined,closing:Promise<void>|undefined;
 const retained=new Set<GpuPixelImage>();
 const counters={processes:0,completedRecordings:0,createdImages:0,releasedImages:0,expiredFrameImages:0,createdDataBuffers:0,releasedDataBuffers:0,expiredFrameDataBuffers:0,cancelled:0};
 function active(signal?:AbortSignal){if(closed)throw new EngineError('E_NATIVE_EFFECTS_CLOSED','Native effect module is disposed');if(signal?.aborted)throw new EngineError('E_RENDER_CANCELLED','Native effect recording cancelled');}
 async function release(image:GpuPixelImage){
  // Only allocations returned by our own original effect factories enter here.
  // Past-frame tokens expire in the existing owner; ignoring that exact error
  // does not admit foreign resources or destroy the shared scope.
  try{await gpu.release(image);counters.releasedImages++;}catch(e){if((e as {code?:string}).code!=='E_NATIVE_SCOPE')throw e;counters.expiredFrameImages++;}
 }
 async function run(input:GpuPixelImage|undefined,recipe:(effects:Filters)=>Promise<GpuPixelImage>,options:NativeImageProcessOptions){
  const owned=new Set<GpuPixelImage>(),released=new WeakSet<GpuPixelImage>(),data=new Set<GpuDataBuffer>(),releasedData=new WeakSet<GpuDataBuffer>();
  // A previous result may be the next recipe input in the SAME frame. Move it
  // into this recipe's ownership, rather than releasing it before it is read.
  // Expired cross-frame tokens are still rejected by the underlying owner.
  if(input!==undefined&&retained.delete(input))owned.add(input);
  for(const previous of retained){await release(previous);retained.delete(previous);}
  const track=(image:GpuPixelImage)=>{if(!owned.has(image)){owned.add(image);counters.createdImages++;}return image;};
  const trackData=(buffer:GpuDataBuffer)=>{data.add(buffer);counters.createdDataBuffers++;return buffer;};
  const releaseData=async(buffer:GpuDataBuffer)=>{try{await gpu.releaseBuffer(buffer);counters.releasedDataBuffers++;}catch(e){if((e as {code?:string}).code!=='E_NATIVE_SCOPE')throw e;counters.expiredFrameDataBuffers++;}};
  // Preserve synchronous queries; mutation/compile delegation checks the outer
  // cancellation even if an individual effect carries a different signal.
  const local=new Proxy(gpu,{get(target,key){
   if(key==='run')return async(...args:Parameters<NativeGpuScope['run']>)=>{active(options.signal);return track(await target.run(...args));};
   if(key==='upload')return async(...args:Parameters<NativeGpuScope['upload']>)=>{active(options.signal);return track(await target.upload(...args));};
   if(key==='convertColor')return async(...args:Parameters<NativeGpuScope['convertColor']>)=>{active(options.signal);return track(await target.convertColor(...args));};
   if(key==='imageToBuffer'&&typeof target.imageToBuffer==='function')return async(...args:Parameters<NonNullable<NativeGpuScope['imageToBuffer']>>)=>{active(options.signal);return trackData(await target.imageToBuffer!(...args));};
   if(key==='createField')return async(...args:Parameters<NativeGpuScope['createField']>)=>{active(options.signal);return trackData(await target.createField(...args));};
   if(key==='createBuffer')return async(...args:Parameters<NativeGpuScope['createBuffer']>)=>{active(options.signal);return trackData(await target.createBuffer(...args));};
   if(key==='cloneBuffer')return async(...args:Parameters<NativeGpuScope['cloneBuffer']>)=>{active(options.signal);return trackData(await target.cloneBuffer(...args));};
   if(key==='releaseBuffer')return async(buffer:GpuDataBuffer)=>{active(options.signal);if(releasedData.has(buffer))return;if(data.has(buffer)){await releaseData(buffer);data.delete(buffer);releasedData.add(buffer);}else await target.releaseBuffer(buffer);};
   if(key==='release')return async(image:GpuPixelImage)=>{active(options.signal);if(released.has(image))return;if(owned.has(image)){await release(image);owned.delete(image);released.add(image);}else await target.release(image);};
   const method=Reflect.get(target,key,target);if(typeof method!=='function')return method;return (...args:unknown[])=>{active(options.signal);return Reflect.apply(method,target,args);};}}) as NativeGpuScope;
  const fx=factory(local,options.context,track,options.signal);
  try{active(options.signal);const result=await recipe(fx);active(options.signal);
   if((input===undefined||result!==input)&&!owned.has(result))throw new EngineError('E_NATIVE_EFFECTS_RESULT','Return this recipe input or an image produced by its typed effects');
   if(owned.delete(result))retained.add(result);counters.completedRecordings++;return result;
  }catch(e){if((e as {code?:string}).code==='E_RENDER_CANCELLED')counters.cancelled++;throw e;}
  finally{try{for(const image of owned)await release(image);}finally{for(const buffer of data)await releaseData(buffer);}}
 }
 function enqueue(input:GpuPixelImage|undefined,recipe:(effects:Filters)=>Promise<GpuPixelImage>,options:NativeImageProcessOptions){
   try{active(options?.signal);if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(k=>!['context','signal'].includes(k))||options.signal!==undefined&&!(options.signal instanceof AbortSignal)||typeof recipe!=='function')throw new EngineError('E_NATIVE_EFFECTS_PARAMETER','Expected a typed recipe and known process options');if(pending)throw new EngineError('E_NATIVE_EFFECTS_BUSY','Await the previous recipe');}catch(e){return Promise.reject(e);}
   counters.processes++;const task=run(input,recipe,options);pending=task;void task.then(()=>{pending=undefined;},()=>{pending=undefined;});return task;
 }
 return {
  processImage(input:GpuPixelImage,recipe:(input:GpuPixelImage,effects:Filters)=>Promise<GpuPixelImage>,options:NativeImageProcessOptions={}){
   if(typeof recipe!=='function')return Promise.reject(new EngineError('E_NATIVE_EFFECTS_PARAMETER','Expected a typed recipe'));
   return enqueue(input,fx=>recipe(input,fx),options);
  },
  generateImage(recipe:(effects:Filters)=>Promise<GpuPixelImage>,options:NativeImageProcessOptions={}){return enqueue(undefined,recipe,options);},
  stats:()=>({version:1 as const,backend:'native-wgpu' as const,completion:'recorded-only' as const,closed,...counters,retainedImages:retained.size,owner:gpu.stats()}),
  dispose(){if(closing)return closing;closed=true;return closing=(async()=>{await pending?.catch(()=>{});for(const image of retained){await release(image);retained.delete(image);}})();},
 };
}
