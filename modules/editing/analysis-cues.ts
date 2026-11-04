import type {Rational} from '../../src/core/types.ts';import {rational} from '../../src/core/time.ts';import {EngineError} from '../../src/core/errors.ts';
import type {VideoAsset,ClipOptions} from './types.ts';import {clip} from './authoring.ts';import {audioClip,audioSourceInfo,type EditAudioSource} from './audio.ts';import {fraction,multiply} from './fractions.ts';
import {frameToSample} from '../../src/audio/time.ts';
export interface EditRange {readonly from:number;readonly to:number}
export interface EditCues {
 schemaVersion:'frameweave.edit-cues/1';range:EditRange;origin:'first-video-frame-or-first-audio-sample';
 input:{sha256:string;bytes:number};
 video:{available:boolean;scenes:{time:number;score:number}[]};
 audio:{available:boolean;offsetSeconds:number;coverage:EditRange|null;silences:EditRange[];onsets:{time:number;rmsDb:number;riseDb:number|null}[];windowSeconds:number|null;silenceTimeResolutionSeconds:number|null};
 methods:{scene:'ffmpeg.scdet';silence:'ffmpeg.silencedetect';onsets:'ffmpeg.astats-rms-rise-candidates';color:'encoded-source-luma; no rendering color transform'};
}
export function cueError(message:string):never {throw new EngineError('E_EDIT_CUES',message);}
export function checkedRange(range:EditRange):EditRange {if(!range||Object.keys(range).some(k=>!['from','to'].includes(k))||!Number.isFinite(range.from)||!Number.isFinite(range.to)||range.from<0||range.to<=range.from)cueError('Use a nonnegative finite half-open source range');return {from:range.from,to:range.to};}
/** Domain result validation, inside the existing authenticated C3 Artifact. Not a new state protocol. */
export function validateEditCues(value:unknown):asserts value is EditCues {
 const v=value as EditCues;if(!v||v.schemaVersion!=='frameweave.edit-cues/1'||v.origin!=='first-video-frame-or-first-audio-sample'||!v.input||!/^[a-f0-9]{64}$/.test(v.input.sha256)||!Number.isSafeInteger(v.input.bytes)||v.input.bytes<1)cueError('Invalid edit cue identity');checkedRange(v.range);
 if(typeof v.video?.available!=='boolean'||typeof v.audio?.available!=='boolean'||!Number.isFinite(v.audio.offsetSeconds)||!Array.isArray(v.video.scenes)||!Array.isArray(v.audio.silences)||!Array.isArray(v.audio.onsets))cueError('Invalid edit cue streams');
 const time=(n:number)=>{if(!Number.isFinite(n)||n<v.range.from||n>=v.range.to)cueError('Cue is outside its source range');};let previous=-Infinity;
 for(const s of v.video.scenes){time(s.time);if(s.time<=previous||!Number.isFinite(s.score)||s.score<0||s.score>100)cueError('Invalid or unordered scene marker');previous=s.time;}
 previous=-Infinity;for(const s of v.audio.silences){checkedRange(s);if(s.from<v.range.from||s.to>v.range.to||s.from<previous)cueError('Invalid or overlapping silence');previous=s.to;}
 previous=-Infinity;for(const s of v.audio.onsets){time(s.time);if(s.time<=previous||!Number.isFinite(s.rmsDb)||s.riseDb!==null&&!Number.isFinite(s.riseDb))cueError('Invalid onset candidate');previous=s.time;}
 if(v.audio.silenceTimeResolutionSeconds!==null&&(!Number.isFinite(v.audio.silenceTimeResolutionSeconds)||v.audio.silenceTimeResolutionSeconds<=0))cueError('Invalid backend silence time precision');
 if(v.audio.available){if(!v.audio.coverage||!v.audio.windowSeconds||!Number.isFinite(v.audio.windowSeconds)||v.audio.windowSeconds<=0)cueError('Audio needs its actual sample-window/coverage');checkedRange(v.audio.coverage);if(v.audio.coverage.from<v.range.from||v.audio.coverage.to>v.range.to)cueError('Audio coverage is outside the analysed range');}
 else if(v.audio.coverage!==null||v.audio.windowSeconds!==null||v.audio.silences.length||v.audio.onsets.length)cueError('Missing audio cannot fabricate observations');
 if(!v.video.available&&v.video.scenes.length)cueError('Missing video cannot fabricate cuts');
 if(v.methods?.scene!=='ffmpeg.scdet'||v.methods.silence!=='ffmpeg.silencedetect'||v.methods.onsets!=='ffmpeg.astats-rms-rise-candidates')cueError('Unknown cue method');
}
export function sceneRanges(cues:EditCues):EditRange[]{validateEditCues(cues);if(!cues.video.available)cueError('This result has no video analysis');const cuts=[cues.range.from,...cues.video.scenes.map(s=>s.time).filter(t=>t>cues.range.from),cues.range.to];return cuts.slice(1).map((to,i)=>({from:cuts[i],to}));}
/** Audible ranges, not speech/person/semantic recognition. Explicit padding and gap joining. */
export function audibleRanges(cues:EditCues,options:{paddingSeconds?:number;joinGapSeconds?:number;minSeconds?:number}={}):EditRange[]{
 validateEditCues(cues);if(!cues.audio.available||!cues.audio.coverage)cueError('No analysed audio coverage');const padding=options.paddingSeconds??.08,gap=options.joinGapSeconds??.08,min=options.minSeconds??.1;
 if(Object.keys(options).some(k=>!['paddingSeconds','joinGapSeconds','minSeconds'].includes(k))||[padding,gap,min].some(n=>!Number.isFinite(n)||n<0))cueError('Range padding/gap/minimum must be finite and nonnegative');
 const coverage=cues.audio.coverage,base:EditRange[]=[];let from=coverage.from;for(const s of cues.audio.silences){const low=Math.max(coverage.from,s.from),high=Math.min(coverage.to,s.to);if(high<=low)continue;if(low>from)base.push({from,to:low});from=Math.max(from,high);}if(from<coverage.to)base.push({from,to:coverage.to});
 const merged:{from:number;to:number}[]=[];for(const r of base){const expanded={from:Math.max(coverage.from,r.from-padding),to:Math.min(coverage.to,r.to+padding)},last=merged.at(-1);if(last&&expanded.from-last.to<=gap)last.to=Math.max(last.to,expanded.to);else merged.push(expanded);}return merged.filter(r=>r.to-r.from>=min);
}
/** Explicit nearest candidate; unmatched cuts remain unchanged and are identified as such. */
export function snapToOnsets(cues:EditCues,times:readonly number[],maxDistanceSeconds=.08){validateEditCues(cues);if(!cues.audio.available||!Number.isFinite(maxDistanceSeconds)||maxDistanceSeconds<0)cueError('Onset snapping needs analysed audio and a finite nonnegative tolerance');const markers=cues.audio.onsets.map(s=>s.time);return times.map(original=>{if(!Number.isFinite(original)||original<cues.range.from||original>=cues.range.to)cueError('Cut is outside the analysed range');let lo=0,hi=markers.length;while(lo<hi){const mid=lo+Math.floor((hi-lo)/2);if(markers[mid]<original)lo=mid+1;else hi=mid;}const candidates=[markers[lo-1],markers[lo]].filter((n):n is number=>n!==undefined).sort((a,b)=>Math.abs(a-original)-Math.abs(b-original)||a-b),best=candidates[0],matched=best!==undefined&&Math.abs(best-original)<=maxDistanceSeconds;return {original,time:matched?best:original,matched};});}
function frameAt(seconds:number,fps:Rational,ceil=true){const f=multiply(fraction(seconds),fps),n=BigInt(f.num),d=BigInt(f.den),value=ceil?(n+d-1n)/d:n/d;if(value>BigInt(Number.MAX_SAFE_INTEGER))cueError('Source frame exceeds the existing time transport');return Number(value);}
export function clipsFromRanges(asset:VideoAsset,ranges:readonly EditRange[],options:{fps:number|Rational;rounding?:'sample'|'cover'}&Omit<ClipOptions,'from'|'duration'|'speed'|'sourceFrame'>){
 if(Object.keys(options).some(k=>!['fps','rounding','fit','sampling','transform','effects'].includes(k))||options.rounding!==undefined&&!['sample','cover'].includes(options.rounding))cueError('Unknown range-to-clip option');
 const {fps:input,rounding='sample',...style}=options,fps=rational(input);return ranges.map(r=>{const checked=checkedRange(r),from=frameAt(checked.from,fps,rounding==='sample'),end=frameAt(checked.to,fps);if(end<=from)cueError('A selected range contains no project sample; retime or omit it explicitly');return clip(asset,{...style,from,duration:end-from});});
}
export function audioFromRanges(source:EditAudioSource,ranges:readonly EditRange[],options:{fps:number|Rational;rounding?:'sample'|'cover';audioOffsetSeconds?:number;gain?:Parameters<typeof audioClip>[1]['gain'];pan?:Parameters<typeof audioClip>[1]['pan'];fadeIn?:number;fadeOut?:number}){
 if(Object.keys(options).some(k=>!['fps','rounding','audioOffsetSeconds','gain','pan','fadeIn','fadeOut'].includes(k))||options.rounding!==undefined&&!['sample','cover'].includes(options.rounding))cueError('Unknown range-to-audio option');
 const info=audioSourceInfo(source),{fps:input,rounding='sample',audioOffsetSeconds=0,...style}=options,fps=rational(input);if(!Number.isFinite(audioOffsetSeconds))cueError('Audio offset must be finite');const offset=multiply(fraction(audioOffsetSeconds),{num:info.sampleRate,den:1});if(offset.den!==1)cueError('Audio offset is not representable as a source sample; convert it explicitly');return ranges.map(r=>{const checked=checkedRange(r),from=frameAt(checked.from,fps,rounding==='sample'),end=frameAt(checked.to,fps),fromSamples=frameToSample(from,info.sampleRate,fps)-offset.num;if(end<=from||fromSamples<0)cueError('Selected audio range is empty or before its source');return audioClip(source,{...style,fromSamples,duration:end-from});});
}
