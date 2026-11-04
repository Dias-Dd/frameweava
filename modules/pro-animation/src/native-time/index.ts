// SPDX-License-Identifier: Apache-2.0
// Absolute-time orchestration only. Shared native kernels own ALL image arithmetic.
import {EngineError} from '../../../../src/core/errors.ts';
import type {FrameContext,Signal} from '../../../../src/core/types.ts';
import {linear709,assertColor} from '../../../../src/media/surface.ts';
import {samePixelColor} from '../../../gpu-effects/pixel-shader.ts';
import type {GpuPixelImage} from '../../../gpu-effects/pixel-types.ts';
import {withGpuResources} from '../../../gpu-effects/resource-arena.ts';
import {createBlendFilters} from '../../../gpu-image-effects/resident/blends/filters.ts';
import {remapTime,posterizeTime,type RemapTimeOptions,type PosterizeTimeOptions} from '../time-controls.ts';
import type {ShutterSamplingOptions} from '../shutter-sampling.ts';
import {
 sourceTimeContext,frameBlendSamples,echoSamples,trailSamples,wideTimeSamples,shutterTimeSamples,
 strobeTime,resolveTimeRange,finite,scalar,fields,timeFail,
 type FrameBlendOptions,type EchoSamplingOptions,type TrailSamplingOptions,type WideTimeSamplingOptions,
 type StrobeTimeOptions,type TimeSample,type TimeSamplePlan,
} from './plans.ts';
import type {NativeTimeEnvironment,NativeTemporalPixelAdapter,NativeTimeSource,NativeTimeOptions,RetimeOptions,NativeTimeOutput,TemporalReduction,TemporalImageSample} from './types.ts';
import {nativeTemporalPixels} from './reduction.ts';
export type * from './types.ts';
export {
 sourceTimeContext,shutterTimeContext,resolveTimeRange,frameBlendSamples,echoSamples,trailSamples,
 wideTimeSamples,shutterTimeSamples,freezeTimeRange,reverseTimeRange,jitterTime,strobeTime,
} from './plans.ts';
export type {SourceTimeRange,TimeSample,TimeSamplePlan,FrameBlendOptions,EchoSamplingOptions,TrailSamplingOptions,WideTimeSamplingOptions,FreezeTimeOptions,StrobeTimeOptions} from './plans.ts';

type Base=NativeTimeOptions;
export type EchoOptions=Base&EchoSamplingOptions&{mode?:Exclude<TemporalReduction,'weighted-mean'>};
export type TrailsOptions=Base&TrailSamplingOptions&{mode?:TemporalReduction};
export type ShutterBlurOptions=Base&ShutterSamplingOptions&{sourceTime?:Signal<number>};
export type WideTimeOptions=Base&WideTimeSamplingOptions;
export type PosterizeOptions=Base&PosterizeTimeOptions;
export type StrobeOptions=Base&StrobeTimeOptions&{time?:Signal<number>};
export type TimeCrossfadeOptions=Base&{progress?:Signal<number>;fromTime?:Signal<number>;toTime?:Signal<number>};
export type TimeDifferenceOptions=Base&{offset?:Signal<number>;targetTime?:Signal<number>;opacity?:Signal<number>;mode?:'absolute'|'subtract'};
const common=['format','signal','range'];
const one=(context:FrameContext,time:number,weight=1):TimeSamplePlan=>({count:1,at(index){if(index!==0)timeFail('One sample only');return Object.freeze({index:0,time,weight,context:sourceTimeContext(context,time)});},*[Symbol.iterator](){yield this.at(0);}});
const cancelled=(signal?:AbortSignal)=>{if(signal?.aborted)throw new EngineError('E_RENDER_CANCELLED','Native time sampling cancelled');};

/** Bind once in existing Stage init. No device, worker, historical image store or scheduler is created.
 * Returned images are caller-owned until released/the existing frame epoch ends. No implicit retention. */
export function createNativeTimeEffects(environment:NativeTimeEnvironment,pixels:NativeTemporalPixelAdapter=nativeTemporalPixels){
 const {gpu:g,width,height}=environment,cap=g?.capabilities();
 if(cap?.backend!=='native-wgpu'||cap.hardwareVerified!==true)throw new EngineError('E_PA_TIME_DEVICE','Native time effects require the admitted native GPU owner; no CPU/Web fallback');
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1)timeFail('Positive Stage dimensions required');
 const color=environment.color??linear709,format=environment.format??'rgba32float';assertColor(color);
 if(color.transfer!=='linear'||color.reference!=='scene'||!['rgba16float','rgba32float'].includes(format))timeFail('Scene-linear F16/F32 output required');
 if(!pixels||pixels.profile!=='native-temporal-compensated-v1'||typeof pixels.reduce!=='function')throw new EngineError('E_PA_TIME_KERNEL_REQUIRED','Supply the reviewed shared native temporal pixel adapter; ordinary repeated F32 blends are not a sum fallback');
 const frozenColor=Object.freeze({...color});let busy=false,recordings=0,sampledImages=0,transparentSamples=0,failed=0;
 function validate(o:Base,extra:readonly string[]):NativeTimeOutput{
  fields(o,[...common,...extra]);if(o.signal!==undefined&&!(o.signal instanceof AbortSignal))timeFail('Expected AbortSignal');cancelled(o.signal);
  if(o.format!==undefined&&!['rgba16float','rgba32float'].includes(o.format))timeFail('Output remains F16/F32');
  if(o.range){resolveTimeRange(o.range.start,o.range);resolveTimeRange(o.range.end,o.range);}
  return {width,height,color:frozenColor,format:o.format??format};
 }
 function validateImage(image:GpuPixelImage){
  const i=image?.info;if(!i||!['rgba16float','rgba32float'].includes(i.format)||i.width!==width||i.height!==height||!samePixelColor(i.color,frozenColor))timeFail('Source must transfer a same-size, same-encoding professional image; convert explicitly inside sourceAt');
 }
 async function run<T>(action:()=>Promise<T>){if(busy)throw new EngineError('E_PA_TIME_BUSY','Await the current Stage-local time operation');busy=true;try{const value=await action();recordings++;return value;}catch(error){failed++;throw error;}finally{busy=false;}}
 async function reduce(source:NativeTimeSource,plan:TimeSamplePlan,o:Base,output:NativeTimeOutput,mode:TemporalReduction='weighted-mean'){
  if(typeof source!=='function')timeFail('Explicit sourceAt callback required');
  const seen=new WeakSet<object>();let consumed=0;
  async function* samples():AsyncGenerator<TemporalImageSample>{
   for(const sample of plan){
    cancelled(o.signal);const time=resolveTimeRange(sample.time,o.range);
    if(time===null||sample.weight===0){transparentSamples++;consumed++;yield {image:null,weight:sample.weight};continue;}
    if(sample.weight<0||!Number.isFinite(sample.weight))timeFail('Nonnegative finite temporal weight required');
    const request=Object.freeze({...sample,time,context:time===sample.time?sample.context:sourceTimeContext(sample.context,time)});
    const image=await source(request);if(!image||seen.has(image))timeFail('sourceAt must transfer a fresh image for every invocation');seen.add(image);
    try{validateImage(image);cancelled(o.signal);sampledImages++;consumed++;yield {image,weight:sample.weight};}
    finally{await g.release(image);}
   }
  }
  const stream=samples();let result:GpuPixelImage|undefined;
  const weights={*[Symbol.iterator](){for(const sample of plan)yield sample.weight;}};
  try{result=await pixels.reduce(g,stream,{mode,output,signal:o.signal,sampleCount:plan.count,weights});cancelled(o.signal);
   if(consumed!==plan.count)throw new EngineError('E_PA_TIME_KERNEL_PROTOCOL','Temporal adapter returned before consuming the complete finite sample plan');
   validateImage(result);if(result.info.alpha!=='premultiplied'||result.info.format!==output.format)timeFail('Temporal adapter must publish the requested PM output precision');return result;
  }catch(error){if(result)await g.release(result);throw error;}finally{await stream.return(undefined);}
 }
 async function retime(source:NativeTimeSource,o:RetimeOptions,context:FrameContext){
  const out=validate(o,['time','fps','origin','method']),method=o.method??'exact',time=scalar(o.time??context.time,context,'time');
  if(!['exact','hold','nearest','linear'].includes(method))timeFail('Known retiming method required');
  const samples=method==='exact'?one(context,time):frameBlendSamples({time,fps:o.fps,origin:o.origin,method},context);
  if(method==='exact'&&(o.fps!==undefined||o.origin!==undefined))timeFail('Source fps/origin belongs to discrete frame sampling');
  return reduce(source,samples,o,out);
 }
 const api={
  retime:(source:NativeTimeSource,o:RetimeOptions={},context:FrameContext)=>run(()=>retime(source,o,context)),
  frameBlend:(source:NativeTimeSource,o:Base&FrameBlendOptions,context:FrameContext)=>run(()=>{const out=validate(o,['time','fps','origin','method']);const {format:_format,signal:_signal,range:_range,...plan}=o;return reduce(source,frameBlendSamples(plan,context),o,out);}),
  echo:(source:NativeTimeSource,o:EchoOptions,context:FrameContext)=>run(()=>{const out=validate(o,['time','echoes','interval','intensity','decay','mode']),{format:_format,signal:_signal,range:_range,mode='add',...plan}=o;if(!['add','blend','maximum','minimum','screen','in-front','in-back'].includes(mode))timeFail('Unknown echo operator');return reduce(source,echoSamples(plan,context),o,out,mode);}),
  trails:(source:NativeTimeSource,o:TrailsOptions,context:FrameContext)=>run(()=>{const out=validate(o,['time','duration','count','direction','falloff','decay','mode']),{format:_format,signal:_signal,range:_range,mode='in-front',...plan}=o;if(!['weighted-mean','add','blend','maximum','minimum','screen','in-front','in-back'].includes(mode))timeFail('Unknown trail operator');return reduce(source,trailSamples(plan,context),o,out,mode);}),
  shutterBlur:(source:NativeTimeSource,o:ShutterBlurOptions,context:FrameContext)=>run(()=>{const out=validate(o,['count','angleDegrees','phaseDegrees','time','sourceTime']),{format:_format,signal:_signal,range:_range,sourceTime,...shutter}=o,plan=shutterTimeSamples(shutter,context);
   const mapped:TimeSamplePlan={count:plan.count,at(i){const s=plan.at(i);if(sourceTime===undefined)return s;const time=scalar(sourceTime,s.context,'shutter source time');return {...s,time,context:sourceTimeContext(s.context,time)};},*[Symbol.iterator](){for(let i=0;i<this.count;i++)yield this.at(i);}};return reduce(source,mapped,o,out);
  }),
  wideTime:(source:NativeTimeSource,o:WideTimeOptions,context:FrameContext)=>run(()=>{const out=validate(o,['time','before','after','count','weight']),{format:_format,signal:_signal,range:_range,...plan}=o;return reduce(source,wideTimeSamples(plan,context),o,out);}),
  posterize:(source:NativeTimeSource,o:PosterizeOptions,context:FrameContext)=>run(()=>{const out=validate(o,['time','rate','origin']),{format:_format,signal:_signal,range:_range,...plan}=o;return reduce(source,one(context,posterizeTime(plan,context)),o,out);}),
  strobe:(source:NativeTimeSource,o:StrobeOptions,context:FrameContext)=>run(()=>{const out=validate(o,['period','onDuration','origin','off','time']),{format:_format,signal:_signal,range:_range,time,...plan}=o,t=scalar(time??context.time,context,'time'),held=strobeTime(t,plan);return reduce(source,one(context,held??t,held===null?0:1),o,out);}),
  timeCrossfade:(from:NativeTimeSource,to:NativeTimeSource,o:TimeCrossfadeOptions,context:FrameContext)=>run(()=>{
   const out=validate(o,['progress','fromTime','toTime']),p=scalar(o.progress??context.progress,context,'progress');if(p<0||p>1||typeof from!=='function'||typeof to!=='function')timeFail('Two sources and progress in [0,1] required');
   const a=scalar(o.fromTime??context.time,context,'from time'),b=scalar(o.toTime??context.time,context,'to time');
   const plan:TimeSamplePlan={count:2,at(i){if(i!==0&&i!==1)timeFail('Crossfade index out of range');return {...one(context,i===0?a:b,i===0?1-p:p).at(0),index:i};},*[Symbol.iterator](){yield this.at(0);yield this.at(1);}};
   return reduce(s=>s.index===0?from(s):to(s),plan,o,out);
  }),
  /** Existing PM blend difference/subtract, NOT AE's nine Alpha/SDR-clamped comparison modes. */
  timeDifference:(source:NativeTimeSource,target:NativeTimeSource,o:TimeDifferenceOptions,context:FrameContext)=>run(async()=>{
   const out=validate(o,['offset','targetTime','opacity','mode']),mode=o.mode??'absolute';if(!['absolute','subtract'].includes(mode)||o.offset!==undefined&&o.targetTime!==undefined)timeFail('Choose targetTime OR offset, and known difference mode');
   const opacity=scalar(o.opacity??1,context,'opacity');if(opacity<0||opacity>1)timeFail('Opacity must be in [0,1]');
   const time=scalar(o.targetTime??(context.time+scalar(o.offset??(-context.dt),context,'offset')),context,'target time');
   return withGpuResources(g,async arena=>{
    const base=arena.image(await reduce(source,one(context,context.time),{...o,format:'rgba32float'}, {...out,format:'rgba32float'})),other=arena.image(await reduce(target,one(context,time),{...o,format:'rgba32float'}, {...out,format:'rgba32float'}));
    cancelled(o.signal);const f=createBlendFilters(g,context,image=>image,o.signal),result=mode==='absolute'?await f.difference(other,base,{opacity,format:out.format,signal:o.signal}):await f.subtractBlend(other,base,{opacity,format:out.format,signal:o.signal});
    if(o.signal?.aborted){await g.release(result);cancelled(o.signal);}return result;
   });
  }),
  stats:()=>({version:1 as const,backend:'native-wgpu' as const,completion:'recorded-only' as const,busy,recordings,failed,sampledImages,transparentSamples,historyImages:0 as const}),
 };
 return api;
}

export type NativeTimeEffects=ReturnType<typeof createNativeTimeEffects>;
/** Ordinary functions remain available for direct composition; bind the environment once for concise TSX. */
export const retime=(fx:NativeTimeEffects,...args:Parameters<NativeTimeEffects['retime']>)=>fx.retime(...args);
export const frameBlend=(fx:NativeTimeEffects,...args:Parameters<NativeTimeEffects['frameBlend']>)=>fx.frameBlend(...args);
export const echo=(fx:NativeTimeEffects,...args:Parameters<NativeTimeEffects['echo']>)=>fx.echo(...args);
export const trails=(fx:NativeTimeEffects,...args:Parameters<NativeTimeEffects['trails']>)=>fx.trails(...args);
export const shutterBlur=(fx:NativeTimeEffects,...args:Parameters<NativeTimeEffects['shutterBlur']>)=>fx.shutterBlur(...args);
export const wideTime=(fx:NativeTimeEffects,...args:Parameters<NativeTimeEffects['wideTime']>)=>fx.wideTime(...args);
export const posterize=(fx:NativeTimeEffects,...args:Parameters<NativeTimeEffects['posterize']>)=>fx.posterize(...args);
export const strobe=(fx:NativeTimeEffects,...args:Parameters<NativeTimeEffects['strobe']>)=>fx.strobe(...args);
export const timeCrossfade=(fx:NativeTimeEffects,...args:Parameters<NativeTimeEffects['timeCrossfade']>)=>fx.timeCrossfade(...args);
export const timeDifference=(fx:NativeTimeEffects,...args:Parameters<NativeTimeEffects['timeDifference']>)=>fx.timeDifference(...args);

// Existing public time math is reused rather than reimplemented/recounted as new effects.
export {remapTime,posterizeTime};export type {RemapTimeOptions,PosterizeTimeOptions};
