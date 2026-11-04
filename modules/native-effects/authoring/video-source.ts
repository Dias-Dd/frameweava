import {assertColor,linear709,type ColorEncoding} from '../../../src/media/surface.ts';
import type {NativeVideoResource} from '../../native-gpu/resources.ts';
import type {ImageFrame,ImageSource} from './types.ts';import {authoringError} from './runtime.ts';
import {imageTime,imageSequence,type ImageObservation} from './temporal.ts';
export type VideoPosition=NativeVideoResource['position'];
export type VideoPositionQuery=VideoPosition|((frame:ImageFrame)=>VideoPosition);
export interface VideoResourceOptions {
 position?:VideoPositionQuery;
 /** Media decoding choice, never a pixel-effect CPU fallback. Default cpu is
  * the existing explicit FFmpeg input path; hardware requires its admitted host. */
 decoder?:NativeVideoResource['decoder'];boundary?:NativeVideoResource['boundary'];
 interpretation?:ColorEncoding;metadataPolicy?:NativeVideoResource['metadataPolicy'];
 width?:number;height?:number;format?:'rgba16float'|'rgba32float';color?:ColorEncoding;
 cacheBytes?:number;
}
const video709:ColorEncoding={...linear709,transfer:'rec709',reference:'display'};
const keys=['position','decoder','boundary','interpretation','metadataPolicy','width','height','format','color','cacheBytes'];
function position(value:VideoPosition,path:string):VideoPosition {
 if(!value||typeof value!=='object'||Array.isArray(value))authoringError(path,'expected source {frame} or exact rational seconds {num, den}');
 if('frame'in value){if(Object.keys(value).length!==1||!Number.isSafeInteger(value.frame)||value.frame<0)authoringError(path+'.frame','expected one nonnegative safe source-frame index');return {frame:value.frame};}
 if(Object.keys(value).some(k=>!['num','den'].includes(k))||!Number.isSafeInteger(value.num)||value.num<0||!Number.isSafeInteger(value.den)||value.den<1)authoringError(path,'expected nonnegative exact rational seconds');return {num:value.num,den:value.den};
}
/** Declared opaque video only. Default time is exact Stage-local seconds, not
 * a guessed source FPS. The existing decoder owns PTS selection/VFR/boundaries,
 * resource seals, caches and cleanup; no new reader, GPU device or permission. */
export function videoResource(id:string,options:VideoResourceOptions={}):ImageSource {
 if(typeof id!=='string'||!id.length)authoringError('video.id','expected a declared file/media Resource ID');
 if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(k=>!keys.includes(k)))authoringError('video.options','unknown video option');
 const config={...options,color:{...(options.color??linear709)},interpretation:{...(options.interpretation??video709)}};
 assertColor(config.color);assertColor(config.interpretation);if(config.color.transfer!=='linear'||config.color.reference!=='scene')authoringError('video.color','expected scene-linear output color');
 for(const key of ['width','height','cacheBytes']as const)if(config[key]!==undefined&&(!Number.isSafeInteger(config[key])||config[key]!<1))authoringError('video.'+key,'expected a positive safe integer');
 if(config.decoder!==undefined&&!['cpu','hardware'].includes(config.decoder)||config.boundary!==undefined&&!['error','clamp','loop'].includes(config.boundary)||config.metadataPolicy!==undefined&&!['validate','override'].includes(config.metadataPolicy)||config.format!==undefined&&!['rgba16float','rgba32float'].includes(config.format))authoringError('video.options','unsupported decoder, boundary, metadata policy or float format');
 const at=typeof config.position==='function'?config.position:config.position===undefined?undefined:position(config.position,'video.position');
 return frame=>frame.resource({version:1,id,decode:'video',decoder:config.decoder??'cpu',boundary:config.boundary??'error',position:position(at===undefined?imageTime(frame):typeof at==='function'?at(frame):at,'video.position'),interpretation:config.interpretation,metadataPolicy:config.metadataPolicy??'validate',output:{width:config.width??frame.init.width,height:config.height??frame.init.height,format:config.format??'rgba32float',color:config.color,alpha:'opaque'},...config.cacheBytes===undefined?{}:{cacheBytes:config.cacheBytes}});
}
export type VideoObservation={readonly time:Extract<ImageObservation,{observed:false}>['time'];readonly observed:false}|{readonly time:ImageObservation['time'];readonly position?:VideoPosition;readonly observed?:true};
/** Existing timestamped imageSequence data. Observation time and source position
 * can differ explicitly. Missing samples never decode or invent an image. */
export function videoSequence(id:string,samples:readonly VideoObservation[],options:Omit<VideoResourceOptions,'position'>={}):readonly ImageObservation[] {
 // Validate even an empty or entirely missing sequence without doing IO.
 videoResource(id,options);if('position'in options)authoringError('videoSequence.options','declare source positions per observation');
 if(!Array.isArray(samples))authoringError('videoSequence.samples','expected timestamped source positions or explicit missing observations');
 return imageSequence(Array.from(samples,(sample,index)=>{
  const path=`videoSequence.samples[${index}]`;if(!sample||typeof sample!=='object'||Array.isArray(sample)||Object.keys(sample).some(k=>!['time','position','observed'].includes(k))||sample.observed!==undefined&&typeof sample.observed!=='boolean')authoringError(path,'expected time, optional source position, and observed');
  if(sample.observed===false){if('position'in sample)authoringError(path,'missing observations cannot include a source position');return {time:sample.time,observed:false as const};}
  return {time:sample.time,...sample.observed===true?{observed:true as const}:{},image:videoResource(id,{...options,position:sample.position??sample.time})};
 }));
}
