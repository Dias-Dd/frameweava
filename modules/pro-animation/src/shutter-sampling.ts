// SPDX-License-Identifier: Apache-2.0
// Local-time quadrature only. Does not render, seek a Stage, or accumulate pixels.
import {evaluate} from '../../../src/core/animation.ts';
import {EngineError} from '../../../src/core/errors.ts';
import {rational} from '../../../src/core/time.ts';
import type {FrameContext,Signal} from '../../../src/core/types.ts';

const fail=(message:string):never=>{throw new EngineError('E_PA_TIME',message);};
function finite(value:number,name:string):number {
 if(typeof value!=='number'||!Number.isFinite(value))fail(`${name} must be finite`);
 return value;
}
export interface ShutterSamplingOptions {
 /** Positive safe integer; evaluated lazily, without an allocated sample array. Default 16. */
 count?:number;
 /** Exposure in LOCAL frames * 360. Nonnegative; values above 360 are allowed. Default 180. */
 angleDegrees?:Signal<number>;
 /** Opening offset in LOCAL frames * 360. Default -angleDegrees/2 (centred shutter). */
 phaseDegrees?:Signal<number>;
 /** LOCAL seconds; defaults to context.time. All Signals resolve once at plan creation. */
 time?:Signal<number>;
}
export interface ShutterSample {
 readonly index:number;
 readonly time:number;
 readonly frame:number;
 /** Positive normalized quadrature weight. A downstream mean must normalize its actual weight sum. */
 readonly weight:number;
}
export interface ShutterSamplePlan extends Iterable<ShutterSample> {
 readonly count:number;
 readonly startTime:number;
 readonly endTime:number;
 readonly exposureSeconds:number;
 /** Arbitrary-order access; repeated indices return equal values. No frame history. */
 at(index:number):Readonly<ShutterSample>;
}
/** Composite-midpoint box shutter in the existing Stage-local time domain.
 * No implicit clamp, media endpoint inference, global-time rewrite, or simulation step.
 * For another source domain, explicitly compose returned seconds with remapTime.
 */
export function shutterSamples(options:ShutterSamplingOptions,context:FrameContext):ShutterSamplePlan {
 const count=options.count??16;
 if(!Number.isSafeInteger(count)||count<1)fail('count must be a positive safe integer');
 const fps=rational(context.fps),period=fps.den/fps.num;
 const scalar=(value:Signal<number>,name:string)=>finite(evaluate(value,context),name);
 const time=scalar(options.time??context.time,'time'),angle=scalar(options.angleDegrees??180,'angleDegrees'),phase=scalar(options.phaseDegrees??(-angle/2),'phaseDegrees');
 if(angle<0)fail('angleDegrees must be nonnegative');
 const exposure=finite(angle/360*period,'exposure seconds'),opening=finite(phase/360*period,'opening offset');
 if(angle>0&&exposure===0)fail('Positive exposure is below Float64 time resolution');
 const start=finite(time+opening,'shutter start'),end=finite(start+exposure,'shutter end');
 if(exposure>0&&end<=start)fail('Shutter endpoints are not resolvable at this absolute time');
 const rawTime=(index:number)=>{
  // Evaluate from the nearer endpoint to avoid losing the far-end midpoint fraction.
  const value=index<count/2?start+((index+.5)/count)*exposure:end-((count-1-index+.5)/count)*exposure;
  return finite(value,'sample time');
 };
 const at=(index:number):Readonly<ShutterSample>=>{
  if(!Number.isSafeInteger(index)||index<0||index>=count)fail(`Sample index must be inside [0, ${count})`);
  const t=exposure===0?start:rawTime(index);
  // Distinct positive-exposure samples must not silently collapse at large offsets/counts.
  if(exposure>0&&(t<=start||t>=end||index>0&&t<=rawTime(index-1)||index+1<count&&t>=rawTime(index+1)))fail('Shutter sample spacing is below Float64 time resolution');
  return Object.freeze({index,time:t,frame:finite(t*(fps.num/fps.den),'sample frame'),weight:1/count});
 };
 // Preflight only constant-space endpoints; each access also checks its own neighbours.
 at(0);if(count>1)at(count-1);
 return Object.freeze({count,startTime:start,endTime:end,exposureSeconds:exposure,at,
  *[Symbol.iterator](){for(let i=0;i<count;i++)yield at(i);},
 });
}
