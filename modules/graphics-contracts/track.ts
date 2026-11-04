import type {TrackData,TrackSample,TrackQuery} from './track-types.ts';
export type {TrackData,TrackSample,TrackQuery} from './track-types.ts';
import * as c from './check.ts';
import type {Coordinates2D} from './types.ts';
import {coordinates2D} from './validate.ts';

/** Formal strict validator for the unchanged analysis.track/1 wire format. */
export function validateTrackData(v:unknown):TrackData {
  c.bounded(v);const o=c.object(v,'$',['schemaVersion','cacheKey','media','model','algorithm','config','time','coordinates','samples']);
  if(o.schemaVersion!=='analysis.track/1')c.fail('$.schemaVersion',`unsupported track schema ${String(o.schemaVersion)}; expected analysis.track/1`,'E_GRAPHICS_VERSION');
  const media=c.object(o.media,'$.media',['name','sha256','bytes']),model=c.object(o.model,'$.model',['id','version','sha256']);
  const a=c.object(o.algorithm,'$.algorithm',['id','packageVersion','implementationSha256','runtimeSha256','decoderSha256','browserVersion','delegate','runningMode','numFaces','identity']);
  const config=c.object(o.config,'$.config',['startSeconds','endSeconds','sampleRate','analysisWidth','minFaceDetectionConfidence','minFacePresenceConfidence','minTrackingConfidence']);
  const startSeconds=c.number(config.startSeconds,'$.config.startSeconds',0,Number.MAX_SAFE_INTEGER/1e6),endSeconds=c.number(config.endSeconds,'$.config.endSeconds',0,Number.MAX_SAFE_INTEGER/1e6);
  if(endSeconds<=startSeconds)c.fail('$.config.endSeconds','must exceed startSeconds');
  const sampleRate=c.integer(config.sampleRate,'$.config.sampleRate',1,30),analysisWidth=c.integer(config.analysisWidth,'$.config.analysisWidth',128,1280);
  if(analysisWidth%2||endSeconds-startSeconds>20||Math.ceil((endSeconds-startSeconds)*sampleRate)>600)c.fail('$.config','outside frozen MVP producer limits (even width, <=20 seconds / 600 samples)');
  const time=c.object(o.time,'$.time',['unit','origin','range','sampling','startUs','endUs']),startUs=c.integer(time.startUs,'$.time.startUs'),endUs=c.integer(time.endUs,'$.time.endUs',startUs+1);
  if(startUs!==Math.round(startSeconds*1e6)||endUs!==Math.round(endSeconds*1e6))c.fail('$.time','config and absolute media microseconds disagree');
  const coords=c.object(o.coordinates,'$.coordinates',['unit','origin','x','y','space','width','height']);
  const samples=c.array(o.samples,'$.samples',c.LIMITS.samples,(v,p,i):TrackSample=>{
    const s=c.object(v,p,['timestampUs','frameIndex','valid','trackId','confidence','landmarkCount','anchor','box','frameAsset','frameSha256']);
    if(typeof s.valid!=='boolean')c.fail(p+'.valid','expected boolean');if(s.confidence!==null)c.fail(p+'.confidence','MVP confidence must remain null; unavailable score is not zero');
    const xy=(v:unknown,q:string)=>{const a=c.object(v,q,['x','y']);return {x:c.number(a.x,q+'.x'),y:c.number(a.y,q+'.y')};};
    let anchor:TrackSample['anchor']=null,box:TrackSample['box']=null,trackId:string|null=null;
    if(s.valid){anchor=xy(s.anchor,p+'.anchor');const b=c.object(s.box,p+'.box',['x','y','width','height']);box={x:c.number(b.x,p+'.box.x'),y:c.number(b.y,p+'.box.y'),width:c.number(b.width,p+'.box.width',Number.MIN_VALUE),height:c.number(b.height,p+'.box.height',Number.MIN_VALUE)};trackId=c.id(s.trackId,p+'.trackId');c.literal(s.landmarkCount,[478],p+'.landmarkCount');}
    else if(s.anchor!==null||s.box!==null||s.trackId!==null||s.landmarkCount!==0)c.fail(p,'missing observation must keep null geometry/ID and zero landmarks');
    const frameAsset=c.string(s.frameAsset,p+'.frameAsset');if(!/^frame-\d{5}\.png$/.test(frameAsset))c.fail(p+'.frameAsset','expected safe MVP frame filename');
    return {timestampUs:c.integer(s.timestampUs,p+'.timestampUs',startUs,endUs-1),frameIndex:c.literal(s.frameIndex,[i],p+'.frameIndex'),valid:s.valid,trackId,confidence:null,landmarkCount:s.valid?478:0,anchor,box,frameAsset,frameSha256:c.sha(s.frameSha256,p+'.frameSha256')};
  },1);
  for(let i=1;i<samples.length;i++)if(samples[i].timestampUs<=samples[i-1].timestampUs)c.fail(`$.samples[${i}].timestampUs`,'timestamps must be strictly increasing');
  const data:TrackData={schemaVersion:'analysis.track/1',cacheKey:c.sha(o.cacheKey,'$.cacheKey'),media:{name:c.string(media.name,'$.media.name'),sha256:c.sha(media.sha256,'$.media.sha256'),bytes:c.integer(media.bytes,'$.media.bytes',1)},model:{id:c.string(model.id,'$.model.id'),version:c.string(model.version,'$.model.version'),sha256:c.sha(model.sha256,'$.model.sha256')},algorithm:{id:c.literal(a.id,['mediapipe.FaceLandmarker'],'$.algorithm.id'),packageVersion:c.string(a.packageVersion,'$.algorithm.packageVersion'),implementationSha256:c.sha(a.implementationSha256,'$.algorithm.implementationSha256'),runtimeSha256:c.sha(a.runtimeSha256,'$.algorithm.runtimeSha256'),decoderSha256:c.sha(a.decoderSha256,'$.algorithm.decoderSha256'),browserVersion:c.string(a.browserVersion,'$.algorithm.browserVersion'),delegate:c.literal(a.delegate,['CPU'],'$.algorithm.delegate'),runningMode:c.literal(a.runningMode,['VIDEO'],'$.algorithm.runningMode'),numFaces:c.literal(a.numFaces,[1],'$.algorithm.numFaces'),identity:c.literal(a.identity,['single-visible-face-segments-not-person-identity'],'$.algorithm.identity')},config:{startSeconds,endSeconds,sampleRate,analysisWidth,minFaceDetectionConfidence:c.number(config.minFaceDetectionConfidence,'$.config.minFaceDetectionConfidence',0,1),minFacePresenceConfidence:c.number(config.minFacePresenceConfidence,'$.config.minFacePresenceConfidence',0,1),minTrackingConfidence:c.number(config.minTrackingConfidence,'$.config.minTrackingConfidence',0,1)},time:{unit:c.literal(time.unit,['microseconds'],'$.time.unit'),origin:c.literal(time.origin,['source-media-start'],'$.time.origin'),range:c.literal(time.range,['start-inclusive-end-exclusive'],'$.time.range'),sampling:c.literal(time.sampling,['ffmpeg-fps-near-grid'],'$.time.sampling'),startUs,endUs},coordinates:{unit:c.literal(coords.unit,['normalized'],'$.coordinates.unit'),origin:c.literal(coords.origin,['top-left'],'$.coordinates.origin'),x:c.literal(coords.x,['right'],'$.coordinates.x'),y:c.literal(coords.y,['down'],'$.coordinates.y'),space:c.literal(coords.space,['decoded-square-pixel-display-frame'],'$.coordinates.space'),width:c.integer(coords.width,'$.coordinates.width',1,16384),height:c.integer(coords.height,'$.coordinates.height',1,16384)},samples};
  return data;
}
export interface TrackReader {query:(sourceMediaSeconds:number,options?:{mode?:'linear'|'nearest';maxGapSeconds?:number})=>TrackQuery}
export function createTrackReader(input:unknown):TrackReader {
  const data=validateTrackData(input); // Detached validated copy; caller mutations cannot change future queries.
  return {query(time,options={}){
    if(options.mode!==undefined&&options.mode!=='linear'&&options.mode!=='nearest')c.fail('query.mode','expected linear or nearest');
    if(!Number.isFinite(time)||!Number.isSafeInteger(Math.round(time*1e6)))c.fail('query.time','expected finite source-media seconds within safe microseconds');
    if(options.maxGapSeconds!==undefined&&(!Number.isFinite(options.maxGapSeconds)||options.maxGapSeconds<0))c.fail('query.maxGapSeconds','expected finite nonnegative seconds');
    return queryTrack(data,time,options);
  }};
}
/** Explicit mapping: Stage local seconds → source-media seconds. No frame rounding or new Signal system. */
export function queryStageTrack(reader:TrackReader,stageTimeSeconds:number,mapping:{sourceStartSeconds:number;rate:number},target:Coordinates2D):
  {visible:false;sourceMediaSeconds:number;reason:Extract<TrackQuery,{valid:false}>['reason']}|
  {visible:true;sourceMediaSeconds:number;targetId:string;x:number;y:number;confidence:null;interpolated:boolean} {
  c.number(stageTimeSeconds,'stageTimeSeconds');c.number(mapping.sourceStartSeconds,'mapping.sourceStartSeconds',0);c.number(mapping.rate,'mapping.rate');
  // Coordinates are an explicit projection, never a TVG Stage transform.
  c.bounded(target);target=coordinates2D(target,'target');
  const sourceMediaSeconds=mapping.sourceStartSeconds+stageTimeSeconds*mapping.rate,q=reader.query(sourceMediaSeconds);
  if(q.valid===false)return {visible:false,sourceMediaSeconds,reason:q.reason};
  return {visible:true,sourceMediaSeconds,targetId:q.trackId,x:q.anchor.x*(target.unit==='px'?target.width:1),y:q.anchor.y*(target.unit==='px'?target.height:1),confidence:null,interpolated:q.interpolated};
}

/** Assertion form for producers and compatibility callers; shares the formal validator. */
export function assertTrackData(value:unknown):asserts value is TrackData { validateTrackData(value); }

/** Pure random-access sampling. Never extrapolates or bridges a lost face/identity. */
export function queryTrack(data:TrackData,timeSeconds:number,options:{mode?:'linear'|'nearest';maxGapSeconds?:number}={}):TrackQuery {
  if(!Number.isFinite(timeSeconds))throw Error('Query time must be finite source-media seconds');
  const t=Math.round(timeSeconds*1e6),samples=data.samples;
  if(t<data.time.startUs||t>=data.time.endUs)return {valid:false,reason:'outside-range'};
  const maxGap=Math.round((options.maxGapSeconds??2/data.config.sampleRate)*1e6);
  if(!Number.isFinite(maxGap)||maxGap<0)throw Error('maxGapSeconds must be finite and nonnegative');
  let low=0,high=samples.length;
  while(low<high){const mid=(low+high)>>>1;if(samples[mid].timestampUs<t)low=mid+1;else high=mid;}
  const at=samples[low];
  const exact=(s:TrackSample):TrackQuery=>s.valid?{valid:true,trackId:s.trackId!,anchor:{...s.anchor!},box:{...s.box!},confidence:null,interpolated:false}:{valid:false,reason:'missing-detection'};
  if(at?.timestampUs===t)return exact(at);
  const a=samples[low-1],b=at;
  if(options.mode==='nearest'){
    const s=!a?b:!b?a:t-a.timestampUs<=b.timestampUs-t?a:b;
    if(!s||Math.abs(s.timestampUs-t)>maxGap)return {valid:false,reason:'gap'};
    return exact(s);
  }
  if(!a||!b)return {valid:false,reason:'not-bracketed'};
  if(!a.valid||!b.valid)return {valid:false,reason:'missing-detection'};
  if(a.trackId!==b.trackId||b.timestampUs-a.timestampUs>maxGap)return {valid:false,reason:'gap'};
  const u=(t-a.timestampUs)/(b.timestampUs-a.timestampUs),lerp=(x:number,y:number)=>x+(y-x)*u;
  return {valid:true,trackId:a.trackId!,confidence:null,interpolated:true,anchor:{x:lerp(a.anchor!.x,b.anchor!.x),y:lerp(a.anchor!.y,b.anchor!.y)},box:{x:lerp(a.box!.x,b.box!.x),y:lerp(a.box!.y,b.box!.y),width:lerp(a.box!.width,b.box!.width),height:lerp(a.box!.height,b.box!.height)}};
}
