// SPDX-License-Identifier: Apache-2.0
import type {FrameContext} from '../../../../src/core/types.ts';
import {sourceTimeContext,shutterTimeContext} from '../native-time/plans.ts';
import {point,source,finite,fields,fail,type MotionSource2D,type Point2D} from './common.ts';
export type MotionClock='stage'|'local';
export interface MotionSamplingOptions {stepSeconds?:number;scheme?:'central'|'forward'|'backward';clock?:MotionClock}
export interface MotionSample2D {
 readonly position:Point2D;readonly velocity:Point2D;readonly acceleration:Point2D;readonly speed:number;
 readonly derivative:'finite-difference';readonly stepSeconds:number;readonly scheme:'central'|'forward'|'backward';readonly clock:MotionClock;
 /** Richardson correction magnitude; a heuristic, NOT a bound/certificate for arbitrary callbacks or discontinuities. */
 readonly estimatedError:Readonly<{velocity:Point2D;acceleration:Point2D}>;
}
/** Existing affine Stage map for genuine subframes, or explicitly local-only Signal time. */
export function motionContext(context:FrameContext,time:number,clock:MotionClock):Readonly<FrameContext>{if(clock!=='stage'&&clock!=='local')fail('Known motion clock required');return clock==='stage'?shutterTimeContext(context,time):sourceTimeContext(context,time);}
/** Differentiate a pure position callback at h and h/2, then Richardson extrapolate.
 * Use one-sided sampling at known jumps/endpoints. No automatic smoothness claim is made. */
export function sampleMotion2D(input:MotionSource2D,context:FrameContext,options:MotionSamplingOptions={}):Readonly<MotionSample2D>{
 source(input);fields(options,['stepSeconds','scheme','clock']);const h=finite(options.stepSeconds??1/1024,'stepSeconds'),scheme=options.scheme??'central',clock=options.clock??'stage';if(h<=0||!['central','forward','backward'].includes(scheme)||!['stage','local'].includes(clock))fail('Positive difference step and known scheme/clock required');
 const time=finite(context.time,'time'),p=point(input(context));if(time+h===time||time-h===time||time+h/2===time||time-h/2===time)fail('Derivative step is below Float64 time resolution');
 const at=(delta:number)=>point(input(motionContext(context,finite(time+delta,'sample time'),clock)));
 const derivatives=(step:number)=>{
  if(scheme==='central'){const a=at(-step),b=at(step);return {v:point([(b[0]-a[0])/(2*step),(b[1]-a[1])/(2*step)]),a:point([((a[0]-p[0])+(b[0]-p[0]))/(step*step),((a[1]-p[1])+(b[1]-p[1]))/(step*step)])};}
  const sign=scheme==='forward'?1:-1,a=at(sign*step),b=at(sign*2*step);return {v:point([sign*(4*(a[0]-p[0])-(b[0]-p[0]))/(2*step),sign*(4*(a[1]-p[1])-(b[1]-p[1]))/(2*step)]),a:point([((b[0]-a[0])-(a[0]-p[0]))/(step*step),((b[1]-a[1])-(a[1]-p[1]))/(step*step)])};
 };
 const full=derivatives(h),half=derivatives(h/2),order=scheme==='central'?4:2;
 const v=point([half.v[0]+(half.v[0]-full.v[0])/3,half.v[1]+(half.v[1]-full.v[1])/3]),a=point([half.a[0]+(half.a[0]-full.a[0])/(order-1),half.a[1]+(half.a[1]-full.a[1])/(order-1)]);
 return Object.freeze({position:p,velocity:v,acceleration:a,speed:finite(Math.hypot(...v),'speed'),derivative:'finite-difference',stepSeconds:h,scheme,clock,estimatedError:Object.freeze({velocity:point([Math.abs(v[0]-half.v[0]),Math.abs(v[1]-half.v[1])]),acceleration:point([Math.abs(a[0]-half.a[0]),Math.abs(a[1]-half.a[1])])})});
}
/** Explicit dead-reckoning inference, not observed TrackData or a physical simulation. */
export function predictMotion2D(sample:Pick<MotionSample2D,'position'|'velocity'|'acceleration'>,seconds:number,options:{acceleration?:boolean}={}){
 fields(options,['acceleration']);finite(seconds,'horizonSeconds');if(options.acceleration!==undefined&&typeof options.acceleration!=='boolean')fail('Boolean acceleration policy required');const p=point(sample.position),v=point(sample.velocity),a=point(sample.acceleration),half=options.acceleration ? .5*seconds*seconds : 0;
 return Object.freeze({position:point([p[0]+v[0]*seconds+a[0]*half,p[1]+v[1]*seconds+a[1]*half]),horizonSeconds:seconds,kind:options.acceleration?'constant-acceleration' as const:'constant-velocity' as const});
}
