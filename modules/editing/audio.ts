import {cloneEditData as structuredClone} from './data.ts';
import type {Rational,Signal} from '../../src/core/types.ts';
import {Composition,Stage,Layer,Resource,ref,type AuthorChild} from '../../src/core/authoring.ts';
import {rational} from '../../src/core/time.ts';
import {EngineError} from '../../src/core/errors.ts';import {expr} from '../../src/core/animation.ts';
import {defineAudioStage,type AuthoredAudioStage} from '../../src/audio/contract.ts';
import {frameToSample} from '../../src/audio/time.ts';
import {assertSampleRate,type AudioSampleRate,type AudioBlockV1} from '../../src/audio/block.ts';
import {createAudioSourceReader,type EditAudioConversion} from './audio-resource.ts';
export const EDIT_AUDIO_SOURCE=Symbol.for('@frameweave/editing.audio-source');
export interface EditAudioSourceOptions {readonly sampleRate:AudioSampleRate;readonly layout:'mono'|'stereo';readonly sampleCount:number;readonly stream?:number;readonly conversion?:EditAudioConversion}
export interface EditAudioInfo extends EditAudioSourceOptions {readonly id:string;readonly src:string}
export type EditAudioSource=AuthoredAudioStage<any,any,{audio:AudioBlockV1}>&{readonly [EDIT_AUDIO_SOURCE]:EditAudioInfo};
export interface EditAudioClip {readonly source:EditAudioSource;readonly from:number;readonly fromSamples?:number;readonly duration:number;readonly gain:Signal<number>;readonly pan:Signal<number>;readonly fadeIn:number;readonly fadeOut:number}
export interface PlacedAudioClip {readonly at:number;readonly clip:EditAudioClip}
export type AudioEditTrack=readonly PlacedAudioClip[];
function fail(message:string):never{throw new EngineError('E_EDIT_AUDIO',message);}
function fields(value:unknown,keys:readonly string[],name:string){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!keys.includes(k)))fail('Invalid '+name+' options');}
function integer(value:number,name:string,min=0){if(!Number.isSafeInteger(value)||value<min)fail(name+' must be a safe integer >= '+min);return value;}
function signal(value:unknown,name:string){if(typeof value==='number'){if(!Number.isFinite(value)||(name==='gain'?value<0:value< -1||value>1))fail('Invalid '+name);return;}if(!value||typeof value!=='object'||Array.isArray(value)||!['$expr','$keyframes','$spring'].some(k=>Object.hasOwn(value,k)))fail(name+' requires a static number or existing Core Signal');}
export function audioSourceInfo(source:EditAudioSource):EditAudioInfo {const info=source?.[EDIT_AUDIO_SOURCE];if(typeof source!=='function'||!info)fail('Use a named exported audioSource() factory');return info;}
/** An ordinary AU-1 source. The admitted host owns decoder/cache/file lifetimes. */
export function audioSource(id:string,src:string,options:EditAudioSourceOptions):EditAudioSource {
 fields(options,['sampleRate','layout','sampleCount','stream','conversion'],'audioSource');assertSampleRate(options.sampleRate);integer(options.sampleCount,'source sampleCount',1);
 if(!/^[a-zA-Z0-9_-]+$/.test(id)||typeof src!=='string'||!src.trim()||!['mono','stereo'].includes(options.layout))fail('A safe Resource id, source path and mono/stereo output layout are required');
 if(options.stream!==undefined)integer(options.stream,'audio stream');
 if(options.conversion!==undefined){fields(options.conversion,['sampleRate','layout'],'audio conversion');if(!['reject','resample'].includes(options.conversion.sampleRate)||!['reject','remix'].includes(options.conversion.layout))fail('Choose explicit sampleRate reject/resample and layout reject/remix');}
 const info=Object.freeze({id,src,...options,...options.conversion?{conversion:Object.freeze({...options.conversion})}:{}});const factory=defineAudioStage({sampleRate:info.sampleRate,layout:info.layout,durationSamples:info.sampleCount},async init=>{
  const read=await createAudioSourceReader(init,info);
  return {async evaluateInterval(request,_inputs,props){const offset=props?.editSourceOffsetSamples??0;if(typeof offset!=='number')fail('Audio source sample offset must be numeric');integer(offset,'Audio source sample offset');const start=integer(offset+request.local.start,'audio source interval start'),end=integer(offset+request.local.endExclusive,'audio source interval end');if(end<=start||end>info.sampleCount)fail('Requested audio exceeds the declared source view');const block=await read(start,end);return {audio:{...block,startSample:request.local.start}};}};
 });Object.defineProperty(factory,EDIT_AUDIO_SOURCE,{value:info});return factory as EditAudioSource;
}
/** Frame-based authoring; lowering uses absolute Engine sample endpoints, never accumulated dt. */
export function audioClip(source:EditAudioSource,options:{from?:number;fromSamples?:number;duration:number;gain?:Signal<number>;pan?:Signal<number>;fadeIn?:number;fadeOut?:number}):EditAudioClip {
 audioSourceInfo(source);fields(options,['from','fromSamples','duration','gain','pan','fadeIn','fadeOut'],'audioClip');const duration=integer(options.duration,'audio duration',1),from=integer(options.from??0,'audio from'),fadeIn=integer(options.fadeIn??0,'fadeIn'),fadeOut=integer(options.fadeOut??0,'fadeOut'),gain=options.gain??1,pan=options.pan??0;
 if(options.fromSamples!==undefined){integer(options.fromSamples,'audio fromSamples');if(from!==0)fail('Choose from or fromSamples, not both');}
 if(fadeIn>duration||fadeOut>duration)fail('A fade must fit the clip duration');signal(gain,'gain');signal(pan,'pan');
 return {source,from,...options.fromSamples===undefined?{}:{fromSamples:options.fromSamples},duration,gain:structuredClone(gain),pan:structuredClone(pan),fadeIn,fadeOut};
}
export function audioAt(frame:number,source:EditAudioClip):PlacedAudioClip {integer(frame,'audio placement');const {source:factory,...options}=source;return {at:frame,clip:audioClip(factory,options)};}
export function audioSequence(...clips:readonly EditAudioClip[]):AudioEditTrack {let cursor=0;return clips.map(c=>{const p=audioAt(cursor,c);cursor=integer(cursor+c.duration,'audio sequence end');return p;});}
/** Existing Layer gain automation evaluated by the mixer at actual sample coordinates. */
function clipGain(placed:PlacedAudioClip,fps:Rational){const {clip:c,at}=placed,rate=audioSourceInfo(c.source).sampleRate,start=frameToSample(at,rate,fps),end=frameToSample(at+c.duration,rate,fps),sample=expr.mul(expr.globalTime,rate),values:any[]=[1];
 if(c.fadeIn){const count=frameToSample(at+c.fadeIn,rate,fps)-start;values.push(expr.div(expr.sub(sample,start),count));}
 if(c.fadeOut){const count=end-frameToSample(at+c.duration-c.fadeOut,rate,fps);values.push(expr.div(expr.sub(end-1,sample),count));}
 return values.length===1?1:expr.clamp(expr.min(...values),0,1);
}
/** Lower only into the current AU-1 Stage + Layer contracts and its one mixer. */
export function audioEditNodes(tracks:readonly AudioEditTrack[],fps:Rational,duration:number,prefix:string,reservedIds:readonly string[]=[]):AuthorChild[]{
 if(!Array.isArray(tracks))fail('Audio tracks must be arrays');const sources=new Map<string,{factory:EditAudioSource;info:EditAudioInfo}>(),placements:PlacedAudioClip[]=[];let selectedRate:AudioSampleRate|undefined;
 for(const track of tracks){if(!Array.isArray(track))fail('Audio track must be an array');for(const p of track){fields(p,['at','clip'],'placed audio');const checked=audioAt(p.at,p.clip),info=audioSourceInfo(checked.clip.source);if(checked.at+checked.clip.duration>duration)fail('Audio exceeds composition duration; extend the edit explicitly');if(reservedIds.includes(info.id))fail('Audio Resource id conflicts with a visual Resource');if(selectedRate!==undefined&&selectedRate!==info.sampleRate)fail('Mixed sample rates require explicit source conversion');selectedRate=info.sampleRate;
  const known=sources.get(info.id);if(known&&known.factory!==checked.clip.source)fail('Audio Resource id has conflicting source factories');if(!known)sources.set(info.id,{factory:checked.clip.source,info});
  const start=frameToSample(checked.at,info.sampleRate,fps),end=frameToSample(checked.at+checked.clip.duration,info.sampleRate,fps),offset=checked.clip.fromSamples??frameToSample(checked.clip.from,info.sampleRate,fps);if(!Number.isSafeInteger(offset+end-start)||offset+end-start>info.sampleCount)fail('Audio trim exceeds the declared source sample count');placements.push(checked);
 }}
 const nodes:AuthorChild[]=[];for(const {info}of sources.values())nodes.push(Resource({id:info.id,src:info.src,kind:'file'}));
 // Reuse each source factory, with an ordinary Stage mapping per placed clip. Core requires
 // Stage active ranges to fit the composition; a long source is NOT a long active Stage.
 for(const [index,p]of placements.entries()){const {info,factory}=sources.get(audioSourceInfo(p.clip.source).id)!,stage=prefix+'-source-'+index,start=frameToSample(p.at,info.sampleRate,fps),count=frameToSample(p.at+p.clip.duration,info.sampleRate,fps)-start,offset=p.clip.fromSamples??frameToSample(p.clip.from,info.sampleRate,fps);
  nodes.push(Stage({id:stage,factory,start:p.at,duration:p.clip.duration,props:{editSourceOffsetSamples:offset}}),Layer({id:prefix+'-gain-'+index,start:p.at,end:p.at+p.clip.duration,gain:p.clip.gain,children:Layer({id:prefix+'-clip-'+index,source:ref(stage,'audio'),start:p.at,end:p.at+p.clip.duration,gain:clipGain(p,fps),pan:p.clip.pan,audio:{startSample:start,sourceOffsetSamples:0,sourceEndSample:count}})}));
 }
 return nodes;
}
/** Audio-only projects reuse public create/WAV export and never request a visual frame. */
export function audioComposition(options:{id?:string;fps:number|Rational;tracks:readonly AudioEditTrack[];duration?:number;seed?:number}){
 fields(options,['id','fps','tracks','duration','seed'],'audioComposition');const fps=rational(options.fps);if(!Array.isArray(options.tracks))fail('Audio tracks must be arrays');const last=Math.max(0,...options.tracks.flatMap((t:AudioEditTrack)=>t.map((p:PlacedAudioClip)=>p.at+p.clip.duration))),duration=integer(options.duration??last,'audio composition duration',1),id=options.id??'audio-edit';
 return Composition({id,width:1,height:1,fps,durationInFrames:duration,seed:options.seed,children:audioEditNodes(options.tracks,fps,duration,id)});
}
