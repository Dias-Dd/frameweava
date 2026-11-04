import {EngineError} from '../../../src/core/errors.ts';
import {rational} from '../../../src/core/time.ts';
import type {Rational} from '../../../src/core/types.ts';
import {exactSeconds,compareSeconds} from '../image-estimation/time.ts';
import {createNativeTemporalEffects} from '../temporal-restoration/filters.ts';
import type {Observation,DenoiseOptions,GrainProfileOptions,GrainSynthesisOptions,GrainMatchOptions,SpectrumOptions} from '../temporal-restoration/types.ts';
import {createNativeStabilizationEffects} from '../stabilization/index.ts';
import type {Observation as StabilizationObservation,StabilizeOptions} from '../stabilization/types.ts';
import type {ImageInput,ImageEffect,ImageFrame} from './types.ts';
import {authoringError,withImageSources,image} from './runtime.ts';

type MissingImageObservation={readonly time:Rational;readonly observed:false};
type ObservedImageInput={readonly time:Rational;readonly observed?:true;readonly image:ImageInput};
export type ImageObservation=MissingImageObservation|ObservedImageInput;
export type TemporalImageObservation=MissingImageObservation|(ObservedImageInput&{readonly motion?:Extract<Observation,{image:unknown}>['motion']});
export type StabilizationImageObservation=MissingImageObservation|(ObservedImageInput&{readonly motionToPrevious?:Extract<StabilizationObservation,{image:unknown}>['motionToPrevious'];readonly weight?:number});
export type ImageTime=Rational|((frame:ImageFrame)=>Rational);
export type TemporalDenoiseOptions=Omit<DenoiseOptions,'time'>&{time?:ImageTime};
export type TemporalSynthesisOptions=Omit<GrainSynthesisOptions,'time'>&{time?:ImageTime};
export type TemporalMatchOptions=Omit<GrainMatchOptions,'time'>&{time?:ImageTime};
export type ImageStabilizeOptions=Omit<StabilizeOptions,'time'>&{time?:ImageTime};

/** Exact conversion at the existing FPS. Fractional Stage frames require an
 * explicit rational frame/time; no accumulated floating-point rounding. */
export function frameSeconds(frame:number|Rational,fps:Rational):Rational {
  const at=typeof frame==='number'?{num:frame,den:1}:frame,rate=rational(fps);exactSeconds(at,'frame');let n=BigInt(at.num)*BigInt(rate.den),d=BigInt(at.den)*BigInt(rate.num),a=n<0n?-n:n,b=d;while(b){[a,b]=[b,a%b];}n/=a;d/=a;
  if(n>BigInt(Number.MAX_SAFE_INTEGER)||n<BigInt(Number.MIN_SAFE_INTEGER)||d>BigInt(Number.MAX_SAFE_INTEGER))throw new EngineError('E_IMAGE_TIME_RANGE','Reduced rational seconds exceed the existing exact-number contract');return {num:Number(n),den:Number(d)};
}
export function imageTime(frame:ImageFrame,clock:'stage'|'project'='stage'):Rational {
  if(clock!=='stage'&&clock!=='project')authoringError('clock','expected stage or project');if(!frame.context)throw new EngineError('E_IMAGE_TIME_CONTEXT','This effect needs FrameContext or an explicit rational time option');
  const index=clock==='stage'?frame.context.frame:frame.context.globalFrame;if(!Number.isSafeInteger(index))throw new EngineError('E_IMAGE_TIME_CONTEXT','Fractional Stage frames need an explicit rational time option',{frame:frame.context.globalFrame,hint:'Pass time: {num, den}, a frame callback, or use imageTime(frame, "project") when observations are on the project clock.'});return frameSeconds(index,frame.context.fps);
}
function time(value:ImageTime|undefined,frame:ImageFrame){const result=value===undefined?imageTime(frame):typeof value==='function'?value(frame):value;const checked=exactSeconds(result,'time');return {num:checked.num,den:checked.den};}

function snapshot<T extends ImageObservation>(values:readonly T[],extra:readonly string[]=[]):readonly T[] {
  if(!Array.isArray(values))authoringError('observations','expected an explicit array');
  const result=Array.from(values,(value,index)=>{const path=`observations[${index}]`;if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['time','observed','image',...extra].includes(k))||value.observed!==undefined&&typeof value.observed!=='boolean')authoringError(path,'expected explicit timestamped images or missing observations');exactSeconds(value.time,path+'.time');
    if(value.observed===false){if(Object.keys(value).some(k=>!['time','observed'].includes(k)))authoringError(path,'missing observations must not carry an image, flow or weight');}else {if(!('image'in value))authoringError(path+'.image','an image source is required');if(typeof value.image!=='function')image(value.image,path+'.image');}
    return Object.freeze({...value,time:Object.freeze({num:value.time.num,den:value.time.den})});
  }).sort((a,b)=>compareSeconds(a.time,b.time));
  for(let i=1;i<result.length;i++)if(compareSeconds(result[i-1].time,result[i].time)===0)authoringError(`observations[${i}].time`,'duplicate exact timestamp');return Object.freeze(result);
}
/** Ordinary detached data declaration, not an executor or upstream Stage sampler. */
export function imageSequence(values:readonly ImageObservation[]):readonly ImageObservation[]{return snapshot(values);}
const inputs=(samples:readonly ImageObservation[])=>samples.flatMap(s=>s.observed===false?[]:[s.image]);
async function temporalInputs(samples:readonly TemporalImageObservation[],frame:ImageFrame,exclude?:Rational):Promise<Observation[]> {
  const result:Observation[]=[];for(const sample of samples){if(exclude&&compareSeconds(sample.time,exclude)===0){if(sample.observed===false)throw new EngineError('E_IMAGE_OBSERVATION_MISSING','Current image time is explicitly marked as missing',{hint:'Do not interpolate across missing observations; choose an observed time or another source.'});continue;}if(sample.observed===false)result.push({time:sample.time,observed:false});else result.push({time:sample.time,...sample.observed===true?{observed:true as const}:{},image:await frame.input(sample.image),...sample.motion?{motion:sample.motion}:{}});}return result;
}
export function temporalDenoise(samples:readonly TemporalImageObservation[],options:TemporalDenoiseOptions={}):ImageEffect {
  const declared=snapshot(samples,['motion']);const {time:at,...controls}=options;
  const operation:ImageEffect=async(image,frame)=>{const current=time(at,frame),resolved=await temporalInputs(declared,frame,current);return frame.process(createNativeTemporalEffects,image,(source,f)=>f.temporalDenoise(source,resolved,{...controls,time:current}));};Object.defineProperty(operation,'name',{value:'temporalDenoise'});return withImageSources(operation,...inputs(declared));
}
/** Profile buffers are prepared and consumed within one original recipe; no
 * expired GPU field escapes. The explicit sample period belongs to the source. */
export function synthesizeTemporalGrain(samples:readonly TemporalImageObservation[],profile:GrainProfileOptions,options:TemporalSynthesisOptions={}):ImageEffect {
  const declared=snapshot(samples,['motion']);const {time:at,...controls}=options;
  const operation:ImageEffect=async(image,frame)=>{const resolved=await temporalInputs(declared,frame),current=time(at,frame);return frame.process(createNativeTemporalEffects,image,async(source,f)=>f.synthesizeTemporalGrain(source,await f.temporalGrainProfile(resolved,profile),{...controls,time:current}));};Object.defineProperty(operation,'name',{value:'synthesizeTemporalGrain'});return withImageSources(operation,...inputs(declared));
}
export function temporalSpectrumView(samples:readonly TemporalImageObservation[],profile:GrainProfileOptions,options:SpectrumOptions={}):ImageEffect {
  const declared=snapshot(samples,['motion']);const operation:ImageEffect=async(image,frame)=>{const resolved=await temporalInputs(declared,frame);return frame.process(createNativeTemporalEffects,image,async(source,f)=>f.temporalSpectrumView(source,await f.temporalGrainProfile(resolved,profile),options));};Object.defineProperty(operation,'name',{value:'temporalSpectrumView'});return withImageSources(operation,...inputs(declared));
}
export function matchTemporalGrain(samples:readonly TemporalImageObservation[],reference:readonly TemporalImageObservation[],options:TemporalMatchOptions):ImageEffect {
  const declared=snapshot(samples,['motion']),target=snapshot(reference,['motion']);const {time:at,...controls}=options;
  const operation:ImageEffect=async(image,frame)=>{const current=time(at,frame),sourceSamples=await temporalInputs(declared,frame,current),targetSamples=await temporalInputs(target,frame);return frame.process(createNativeTemporalEffects,image,(source,f)=>f.matchTemporalGrain(source,sourceSamples,targetSamples,{...controls,time:current}));};Object.defineProperty(operation,'name',{value:'matchTemporalGrain'});return withImageSources(operation,...inputs(declared),...inputs(target));
}
export function stabilizeSequencePath(samples:readonly StabilizationImageObservation[],options:ImageStabilizeOptions={}):ImageEffect {
  const declared=snapshot(samples,['motionToPrevious','weight']);const {time:at,...controls}=options;
  const operation:ImageEffect=async(image,frame)=>{const resolved:StabilizationObservation[]=[];for(const sample of declared){if(sample.observed===false)resolved.push({time:sample.time,observed:false});else resolved.push({time:sample.time,image:await frame.input(sample.image),...sample.motionToPrevious?{motionToPrevious:sample.motionToPrevious}:{},...sample.weight!==undefined?{weight:sample.weight}:{}});}return frame.process(createNativeStabilizationEffects,image,(source,f)=>f.stabilizeSequencePath(source,resolved,{...controls,time:time(at,frame)}));};Object.defineProperty(operation,'name',{value:'stabilizeSequencePath'});return withImageSources(operation,...inputs(declared));
}
