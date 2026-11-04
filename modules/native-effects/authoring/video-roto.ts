import {evaluate} from '../../../src/core/animation.ts';import type {Signal} from '../../../src/core/types.ts';
import {createNativeVideoRotoEffects,parseVideoRotoBundle} from '../video-roto/index.ts';
import type {VideoRotoFilters,VideoRotoInspection,VideoRotoOptions as OriginalOptions} from '../video-roto/types.ts';
import type {ImageAsset,ImageProcessor,ImageEffect,ImageInput,ImageSource,ImageFrame} from './types.ts';
import {prepareImageEffects,withPreparedEffects} from './prepared.ts';import {authoringError,withImageSources,image} from './runtime.ts';
export type VideoRotoModel=ImageAsset<ImageProcessor<VideoRotoFilters>>;
export interface VideoRotoReader {
 readonly totalFrames:number;
 read(index:number,frame:ImageFrame):ImageInput|undefined|Promise<ImageInput|undefined>;
 /** Declare sources that need preparation; read remains an ordinary function. */
 readonly sources?:readonly ImageSource[];
}
export type VideoRotoFrames=readonly(ImageInput|undefined)[]|VideoRotoReader;
export interface TrackVideoRotoOptions extends Omit<OriginalOptions,'id'|'frame'|'totalFrames'|'seedFrame'|'seedMask'|'threshold'|'softness'|'analysisBackground'> {
 id?:string;seedFrame?:number;seedMask:ImageInput;
 /** Explicit source-frame mapping. Never guess FPS, round a subframe or advance history. */
 frame:number|((frame:ImageFrame)=>number);
 threshold?:Signal<number>;softness?:Signal<number>;
 analysisBackground?:readonly[Signal<number>,Signal<number>,Signal<number>];
}
export function videoRotoModel(value:unknown,inspection:VideoRotoInspection={}):VideoRotoModel {const bundle=parseVideoRotoBundle(value);return prepareImageEffects(init=>createNativeVideoRotoEffects(init,bundle,inspection));}
function input(value:ImageInput,path:string){if(typeof value!=='function')image(value,path);}
function reader(value:VideoRotoFrames):VideoRotoReader {
 if(Array.isArray(value)){
  const declared:readonly(ImageInput|undefined)[]=value;const samples=Array.from(declared,(v,index)=>{if(!Object.hasOwn(value,index))authoringError('videoRoto.frames['+index+']','use explicit undefined for a missing observation');if(v!==undefined)input(v,'videoRoto.frames['+index+']');return v;});
  if(!samples.length||samples.length>0xffffffff)authoringError('videoRoto.frames','expected positive length within original source-frame addressing');
  return {totalFrames:samples.length,read:index=>samples[index],sources:samples.filter((v):v is ImageSource=>typeof v==='function')};
 }
 if(!value||typeof value!=='object'||Object.keys(value).some(k=>!['totalFrames','read','sources'].includes(k))||!('read'in value)||typeof value.read!=='function'||!Number.isSafeInteger(value.totalFrames)||value.totalFrames<1||value.totalFrames>0xffffffff||value.sources!==undefined&&(!Array.isArray(value.sources)||Array.from(value.sources).some(v=>typeof v!=='function')))authoringError('videoRoto.reader','expected totalFrames, ordinary read(index, frame), and optional declared sources');
 return {totalFrames:value.totalFrames,read:(index,frame)=>value.read(index,frame),sources:value.sources?[...value.sources]:[]};
}
function scalar(value:Signal<number>|undefined,frame:ImageFrame,path:string):number|undefined {
 if(value===undefined)return;let result:unknown=value;if(typeof value!=='number'){if(!frame.context)authoringError(path,'animated controls require FrameContext');result=evaluate(value,frame.context);}if(typeof result!=='number'||!Number.isFinite(result))authoringError(path,'expected a finite number after existing Signal evaluation');return result;
}
/** Prepare one original model declaration per Stage, replay only explicit
 * observations, return the original image and keep temporary memory recipe-local. */
export function trackVideoRoto(model:VideoRotoModel,frames:VideoRotoFrames,options:TrackVideoRotoOptions):ImageEffect {
 if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(k=>!['id','frame','seedFrame','seedMask','maxReplayFrames','segmentFrames','threshold','softness','analysisBackground','format','signal'].includes(k))||!['number','function'].includes(typeof options.frame))authoringError('videoRoto.options','expected explicit source frame, seedMask and original controls');
 input(options.seedMask,'videoRoto.seedMask');const sequence=reader(frames),{frame:at,seedMask,threshold,softness,analysisBackground,...controls}=options;
 if(analysisBackground!==undefined&&(!Array.isArray(analysisBackground)||analysisBackground.length!==3||Array.from(analysisBackground).some(v=>v===undefined)))authoringError('videoRoto.analysisBackground','expected three working RGB Signal leaves');
 const operation=withPreparedEffects(model,async(current,f,frame)=>{
  const index=typeof at==='function'?at(frame):at,seedFrame=controls.seedFrame??0;
  if(!Number.isSafeInteger(index)||index<0||index>=sequence.totalFrames||!Number.isSafeInteger(seedFrame)||seedFrame<0||seedFrame>index)authoringError('videoRoto.frame','expected exact seedFrame <= source frame < totalFrames');
  const background=analysisBackground?[scalar(analysisBackground[0],frame,'videoRoto.analysisBackground[0]')!,scalar(analysisBackground[1],frame,'videoRoto.analysisBackground[1]')!,scalar(analysisBackground[2],frame,'videoRoto.analysisBackground[2]')!]as const:undefined;
  const sourceAt=async(n:number)=>{const sample=await sequence.read(n,frame);return sample===undefined?undefined:frame.input(sample);};
  return (await f.trackVideoRoto(current,sourceAt,{...controls,id:controls.id??'subject',seedFrame,frame:index,totalFrames:sequence.totalFrames,seedMask:await frame.input(seedMask),threshold:scalar(threshold,frame,'videoRoto.threshold'),softness:scalar(softness,frame,'videoRoto.softness'),analysisBackground:background})).image;
 },'trackVideoRoto');return withImageSources(operation,seedMask,...sequence.sources??[]);
}
