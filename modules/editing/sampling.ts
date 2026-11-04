import type {Rational,FrameContext} from '../../src/core/types.ts';
import {evaluate} from '../../src/core/animation.ts';
import type {EditPlan,PlacedClip,EditTrack} from './types.ts';
import type {EditTransition} from './transitions.ts';
import {editInteger,editError} from './authoring.ts';
import {fraction,add,multiply,timeError} from './fractions.ts';
/** Exact rational PTS, derived from the existing project frame rate. No wall clock or accumulated dt. */
export function sourcePosition(placed:PlacedClip,frame:number,fps:Rational,context?:FrameContext):Rational{
 editInteger(frame,'requested frame');const local=frame-placed.at;
 if(local<0||local>=placed.clip.duration)editError('Cannot sample an inactive clip');
 const clip=placed.clip;let source:Rational;
 if(clip.sourceFrame!==undefined){if(!context)timeError('A sourceFrame Signal requires the actual Stage FrameContext');source=fraction(evaluate(clip.sourceFrame,context));}
 else source=add(fraction(clip.sourceIn),multiply(clip.rate??{num:1,den:1},{num:local,den:1}));
 if(source.num<0)timeError('Time mapping sampled before source zero');
 return multiply(source,{num:fps.den,den:fps.num});
}
/** Each sorted non-overlapping track uses binary search; timeline length does not allocate per-frame state. */
export function activeClip(track:EditTrack,frame:number):PlacedClip|undefined {
 let lo=0,hi=track.length;while(lo<hi){const m=lo+Math.floor((hi-lo)/2);if(track[m].at<=frame)lo=m+1;else hi=m;}
 const p=track[lo-1];return p&&frame<p.at+p.clip.duration?p:undefined;
}
export function activeClips(plan:EditPlan,frame:number):readonly PlacedClip[]{
 editInteger(frame,'requested frame');if(frame>=plan.duration)editError('Requested frame is outside the edit',{frame,duration:plan.duration});
 return activeTracks(plan,frame).flatMap(s=>s.clips);
}
export interface EditTrackSample {readonly clips:readonly PlacedClip[];readonly transition?:EditTransition;readonly progress:number}
export function activeTracks(plan:EditPlan,frame:number):readonly EditTrackSample[]{
 editInteger(frame,'requested frame');if(frame>=plan.duration)editError('Requested frame is outside the edit');
 const sampled:EditTrackSample[]=[];for(const track of plan.tracks){let lo=0,hi=track.length;while(lo<hi){const mid=lo+Math.floor((hi-lo)/2);if(track[mid].at<=frame)lo=mid+1;else hi=mid;}const p=track[lo-1];if(!p||frame>=p.at+p.clip.duration)continue;
  const t=p.transition;if(t&&frame<p.at+t.duration)sampled.push({clips:[track[lo-2],p],transition:t,progress:t.duration===1?1:(frame-p.at)/(t.duration-1)});else sampled.push({clips:[p],progress:1});
 }return sampled;
}
