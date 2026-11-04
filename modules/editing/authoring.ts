import {cloneEditData as structuredClone} from './data.ts';
import {Composition,Stage,Layer,Resource,ref} from '../../src/core/authoring.ts';
import {rational,secondsToFrame} from '../../src/core/time.ts';
import {EngineError} from '../../src/core/errors.ts';
import type {ColorEncoding} from '../../src/media/surface.ts';
import {assertColor} from '../../src/media/surface.ts';
import type {EditAsset,VideoAsset,ImageAsset,EditClip,PlacedClip,EditTrack,ClipOptions,EditPlan,TimelineOptions,EditCompositionOptions} from './types.ts';
import {EDITING_PLAN,type EditStageFactory} from './types.ts';
import {fraction,compact,add,multiply,timeError} from './fractions.ts';
import {validateTextAsset} from './text.ts';
import {validateEffects} from './effects.ts';
import {validateTransition,transitionError} from './transitions.ts';
import {audioEditNodes} from './audio.ts';
export const sdrVideo709:Readonly<ColorEncoding>=Object.freeze({primaries:'rec709',transfer:'rec709',whitePoint:'D65',reference:'display',range:'full',referenceWhiteNits:100});
export function editError(message:string,details?:Record<string,unknown>):never {throw new EngineError('E_EDIT_PARAMETER',message,{details});}
function fields(o:unknown,keys:readonly string[],label:string):void{
 if(!o||typeof o!=='object'||Array.isArray(o))editError(label+' must be an object');
 for(const k of Object.keys(o as object))if(!keys.includes(k))editError(label+' has no option '+k);
}
export function editInteger(n:number,label:string,min=0){if(!Number.isSafeInteger(n)||n<min)editError(label+' must be a safe integer >= '+min);return n;}
function assetBase(id:string,src:string,o:{width:number;height:number}){
 if(typeof id!=='string'||!/^[a-zA-Z0-9_-]+$/.test(id)||typeof src!=='string'||!src.trim())editError('A safe Resource id and source path are required');
 editInteger(o.width,'asset width',1);editInteger(o.height,'asset height',1);
 return {id,src,width:o.width,height:o.height};
}
/** Explicit CPU input decoding is the portable default; rendering remains Native GPU.
 * Hardware decoding never falls back. Default source interpretation is tagged SDR Rec709 at 100 nits. */
export function video(id:string,src:string,o:{width:number;height:number;decoder?:VideoAsset['decoder'];interpretation?:ColorEncoding;metadataPolicy?:VideoAsset['metadataPolicy'];cacheBytes?:number}):VideoAsset{
 fields(o,['width','height','decoder','interpretation','metadataPolicy','cacheBytes'],'video');
 const decoder=o.decoder??'cpu',metadataPolicy=o.metadataPolicy??'validate';
 if(!['cpu','hardware'].includes(decoder)||!['validate','override'].includes(metadataPolicy))editError('Invalid video decoder or metadata policy');
 if(metadataPolicy==='override'&&!o.interpretation)editError('Video metadata override requires an explicit interpretation');
 if(o.cacheBytes!==undefined)editInteger(o.cacheBytes,'video cacheBytes',1);
 assertColor(o.interpretation??sdrVideo709);
 return structuredClone({...assetBase(id,src,o),kind:'video',decoder,interpretation:o.interpretation??sdrVideo709,metadataPolicy,...o.cacheBytes===undefined?{}:{cacheBytes:o.cacheBytes}});
}
export function image(id:string,src:string,o:{width:number;height:number;decode?:ImageAsset['decode'];missingProfile?:ImageAsset['missingProfile'];alpha?:ImageAsset['alpha']}):ImageAsset{
 fields(o,['width','height','decode','missingProfile','alpha'],'image');
 const decode=o.decode??'icc-sdr',missingProfile=o.missingProfile??'error',alpha=o.alpha??'premultiplied';
 if(!['icc-sdr','surface-v2'].includes(decode)||!['error','assume-srgb'].includes(missingProfile)||!['straight','premultiplied','opaque'].includes(alpha))editError('Invalid image decoding/Alpha policy');
 return {...assetBase(id,src,o),kind:'image',decode,missingProfile,alpha};
}
export function clip(asset:EditAsset,o:ClipOptions):EditClip{
 fields(o,['from','duration','speed','sourceFrame','fit','sampling','transform','effects'],'clip');validateAsset(asset);validateEffects(o.effects);
 const first=fraction(o.from??0),rate=fraction(o.speed??1),sourceIn=compact(first),duration=editInteger(o.duration,'clip duration',1),fit=o.fit??'contain',sampling=o.sampling??'linear';
 if(first.num<0)editError('Clip from must not be negative');
 if(add(first,multiply(rate,{num:duration-1,den:1})).num<0)timeError('A clip may not sample before source time zero');
 if(o.sourceFrame!==undefined&&(first.num!==0||rate.num!==1||rate.den!==1))timeError('Absolute sourceFrame cannot also use from or speed; combine the mapping explicitly');
 if(asset.kind==='text'&&(first.num!==0||rate.num!==rate.den||o.sourceFrame!==undefined))editError('Prepared text is static geometry; animate its transform, placement or duration');
 if(!['contain','cover','stretch'].includes(fit)||!['nearest','linear'].includes(sampling))editError('Invalid clip fit/sampling');
 fields(o.transform??{},['x','y','scale','scaleX','scaleY','rotation','opacity','originX','originY'],'clip transform');
 return structuredClone({asset,sourceIn,duration,rate,...o.sourceFrame===undefined?{}:{sourceFrame:o.sourceFrame},fit,sampling,transform:o.transform??{},...o.effects===undefined?{}:{effects:o.effects}});
}
/** Split in project frames. Both halves retain the exact original source sampling. */
export function splitClip(source:EditClip,at:number):readonly [EditClip,EditClip]{
 validateClip(source);editInteger(at,'split frame',1);if(at>=source.duration)editError('Split must be inside the clip');
 const next=source.sourceFrame===undefined?compact(add(fraction(source.sourceIn),multiply(source.rate??{num:1,den:1},{num:at,den:1}))):0;
 return [{...structuredClone(source),duration:at},{...structuredClone(source),sourceIn:next,duration:source.duration-at}];
}
export function at(frame:number,source:EditClip):PlacedClip {editInteger(frame,'clip placement');validateClip(source);return {at:frame,clip:structuredClone(source)};}
export function sequence(...clips:readonly EditClip[]):EditTrack {let cursor=0;return clips.map(c=>{const placed=at(cursor,c);cursor=editInteger(cursor+c.duration,'sequence duration');return placed;});}
/** Convenience only; uses the existing Engine conversion and rounding policy. */
export function frames(seconds:number,fps:number|{num:number;den:number}):number {const n=secondsToFrame(seconds,rational(fps));return editInteger(n,'seconds converted to frames');}
function validateAsset(a:EditAsset){
 if(a?.kind==='video'){fields(a,['kind','id','src','width','height','decoder','interpretation','metadataPolicy','cacheBytes'],'video asset');video(a.id,a.src,{width:a.width,height:a.height,decoder:a.decoder,interpretation:a.interpretation,metadataPolicy:a.metadataPolicy,cacheBytes:a.cacheBytes});}
 else if(a?.kind==='image'){fields(a,['kind','id','src','width','height','decode','missingProfile','alpha'],'image asset');image(a.id,a.src,{width:a.width,height:a.height,decode:a.decode,missingProfile:a.missingProfile,alpha:a.alpha});}
 else if(a?.kind==='text')validateTextAsset(a);
 else editError('Expected a video() or image() asset');
}
function validateClip(c:EditClip){
 fields(c,['asset','sourceIn','duration','rate','sourceFrame','fit','sampling','transform','effects'],'edit clip');
 clip(c.asset,{from:c.sourceIn,duration:c.duration,speed:c.rate,sourceFrame:c.sourceFrame,fit:c.fit,sampling:c.sampling,transform:c.transform,effects:c.effects});
}
export function timeline(o:TimelineOptions):EditPlan{
 fields(o,['fps','tracks','duration','background','format','effects'],'timeline');validateEffects(o.effects);const fps=rational(o.fps),format=o.format??'rgba32float';
 if(!['rgba16float','rgba32float'].includes(format)||!Array.isArray(o.tracks))editError('Expected float output and an array of tracks');
 const assets=new Map<string,string>();let last=0;
 const tracks=o.tracks.map((track,index)=>{
  if(!Array.isArray(track))editError('Track must be an array',{track:index});
  const sorted=track.map(p=>{fields(p,['at','clip','transition'],'placed clip');if(p.transition)validateTransition(p.transition);return {...at(p.at,p.clip),...p.transition?{transition:structuredClone(p.transition)}:{}};}).sort((a,b)=>a.at-b.at);
  let end=0;for(const [i,p]of sorted.entries()){
   if(p.at<end){const previous=sorted[i-1],t=p.transition;if(!t)editError('Overlaps require an explicit transition or another overlay track',{track:index,at:p.at});if(!previous||p.at+t.duration!==end||t.duration>p.clip.duration||t.duration>previous.clip.duration)transitionError('Transition must match the exact overlap of two declared clips');if(i>1&&p.at<sorted[i-2].at+sorted[i-2].clip.duration)transitionError('Three-clip transition overlaps are not supported');}
   else if(p.transition)transitionError('A transition needs an overlapping previous clip');
   end=editInteger(p.at+p.clip.duration,'track end');
   const a=p.clip.asset,signature=JSON.stringify(a),previous=assets.get(a.id);if(previous!==undefined&&previous!==signature)editError('Resource id has conflicting asset definitions',{id:a.id});assets.set(a.id,signature);
  }last=Math.max(last,end);return sorted;
 });
 const duration=editInteger(o.duration??last,'timeline duration',1);if(last>duration)editError('Timeline duration truncates a clip; trim it explicitly');
 const background=o.background??[0,0,0,1];if(!Array.isArray(background)||background.length!==4||background.some(n=>!Number.isFinite(n)||!Number.isFinite(Math.fround(n)))||background[3]<0||background[3]>1)editError('Background requires finite scene-linear RGBA with Alpha in [0,1]');
 return structuredClone({version:1,fps,duration,tracks,background,format,...o.effects===undefined?{}:{effects:o.effects}});
}
export function validatePlan(plan:EditPlan):EditPlan{
 fields(plan,['version','fps','duration','tracks','background','format','effects'],'edit plan');if(plan.version!==1)editError('Unsupported editing plan version');
 return timeline({fps:plan.fps,duration:plan.duration,tracks:plan.tracks,background:plan.background,format:plan.format,effects:plan.effects});
}
/** Lower into the CURRENT Composition/Stage/Layer/Resource graph. No second scheduler. */
export function editComposition(o:EditCompositionOptions){
 fields(o,['id','width','height','seed','factory','fps','tracks','duration','background','format','effects','audio'],'editComposition');
 const embedded=(o.factory as Partial<EditStageFactory>)?.[EDITING_PLAN];
 if(embedded&&['fps','tracks','duration','background','format','effects'].some(k=>Object.hasOwn(o,k)))editError('Edit options belong in editingStage(); do not also override them in editComposition()');
 const plan=embedded?validatePlan(embedded):timeline({fps:o.fps!,tracks:o.tracks!,duration:o.duration,background:o.background,format:o.format,effects:o.effects}),assets=new Map<string,EditAsset>();
 for(const track of plan.tracks)for(const p of track)assets.set(p.clip.asset.id,p.clip.asset);
 const id=o.id??'edit',stageId=id+'-video';
 return Composition({id,width:o.width,height:o.height,fps:plan.fps,seed:o.seed,durationInFrames:plan.duration,background:'transparent',children:[
  ...[...assets.values()].filter(a=>a.kind!=='text').map(a=>Resource({id:a.id,src:a.src,kind:a.kind==='video'?'media':a.decode==='surface-v2'?'file':'image'})),
  // Existing Core recursively evaluates Signals in props. A fallback string keeps
  // the authored expressions intact; editingStage() avoids transporting the plan at all.
  Stage({id:stageId,factory:o.factory,props:embedded?{}:{edit:JSON.stringify(plan)},seek:'stateless',outputs:{surface:'surface'}}),Layer({source:ref(stageId)}),
  ...o.audio===undefined?[]:audioEditNodes(o.audio,plan.fps,plan.duration,id+'-audio',[...assets.keys()])
 ]});
}
