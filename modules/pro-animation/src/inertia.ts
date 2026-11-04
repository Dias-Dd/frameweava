// SPDX-License-Identifier: Apache-2.0 AND MIT
// Exponential decay model adapted from Motion inertia.ts @2f9f45e0d3b56ab3a9cf2f8b1a42336a6d4c762c.
// Copyright (c) 2024 Motion B.V. See ../attribution/motion. No Motion scheduler/DOM/runtime is imported.
import {spring,springAt} from '../../../src/core/animation.ts';
import {rational} from '../../../src/core/time.ts';
import {EngineError} from '../../../src/core/errors.ts';
import type {FrameContext,Spring} from '../../../src/core/types.ts';

export interface InertiaOptions {
 from:number;
 /** Actual right-hand initial derivative, value units / Stage-local second. */
 velocity:number;
 timeConstantSeconds?:number;
 /** Existing Core frame coordinate, not wall-clock milliseconds. */
 startFrame?:number;
 /** One analytic handoff to a soft spring anchor, not collision containment. */
 bounds?:{min?:number;max?:number;spring?:Partial<Pick<Spring['$spring'],'stiffness'|'damping'|'mass'>>};
}
export interface InertiaHandoff {readonly elapsedSeconds:number;readonly position:number;readonly velocity:number;readonly side:'min'|'max';readonly reason:'initial-outside'|'crossing'}
export interface InertiaSample {value:number;velocity:number;elapsedSeconds:number;phase:'hold'|'constant'|'decay'|'spring'}
export interface InertiaResponse {
 readonly freeTarget:number;readonly handoff:InertiaHandoff|undefined;readonly timeConstantSeconds:number;readonly startFrame:number;
 sample(context:FrameContext):InertiaSample;valueAt(context:FrameContext):number;velocityAt(context:FrameContext):number;
}
function fail(message:string,details?:unknown):never {throw new EngineError('E_PA_INERTIA',message,{details});}
function finite(n:number,name:string){if(typeof n!=='number'||!Number.isFinite(n))fail(`${name} must be finite`,{parameter:name});return n;}
function keys(value:unknown,allowed:string[],name:string){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!allowed.includes(k)))fail(`${name} must contain only documented fields`);}

/** Pure absolute-frame sampler. No new Signal variant, integrator, history buffer or duration heuristic. */
export function createInertia(options:InertiaOptions):InertiaResponse{
 keys(options,['from','velocity','timeConstantSeconds','startFrame','bounds'],'options');
 const from=finite(options.from,'from'),velocity=finite(options.velocity,'velocity'),tau=finite(options.timeConstantSeconds??.325,'timeConstantSeconds'),start=finite(options.startFrame??0,'startFrame');
 if(tau<=0)fail('timeConstantSeconds must be positive');
 const amplitude=finite(velocity*tau,'decay amplitude'),freeTarget=velocity===0?from:finite(from+amplitude,'free target');
 let min:number|undefined,max:number|undefined;
 if(options.bounds!==undefined){keys(options.bounds,['min','max','spring'],'bounds');if(options.bounds.min!==undefined)min=finite(options.bounds.min,'min');if(options.bounds.max!==undefined)max=finite(options.bounds.max,'max');if(min===undefined&&max===undefined)fail('Bounds require min or max');if(min!==undefined&&max!==undefined&&min>max)fail('min must not exceed max');if(options.bounds.spring!==undefined)keys(options.bounds.spring,['stiffness','damping','mass'],'bounds.spring');}
 const configured=spring({from:0,to:0,...options.bounds?.spring}).$spring;
 let handoff:InertiaHandoff|undefined;
 const setInitial=(position:number,side:'min'|'max')=>{handoff=Object.freeze({elapsedSeconds:0,position,velocity,side,reason:'initial-outside' as const});};
 if(min!==undefined&&from<min)setInitial(min,'min');
 else if(max!==undefined&&from>max)setInitial(max,'max');
 else{
  const side=velocity>0&&max!==undefined&&(from===max||amplitude>max-from)?'max':velocity<0&&min!==undefined&&(from===min||-amplitude>from-min)?'min':undefined;
  if(side){
   const position=side==='max'?max!:min!,distance=position-from,fraction=distance===0?0:distance/amplitude;
   // log1p preserves an early crossing; the remaining displacement form preserves a late crossing.
   const remaining=distance===0?1:(amplitude-distance)/amplitude,log=fraction<.5?Math.log1p(-fraction):Math.log(remaining),at=finite(-tau*log,'boundary crossing time');
   if(at<0||at===0&&position!==from)fail('Boundary time is below Float64 resolution');
   const hitVelocity=finite(velocity*remaining,'boundary velocity');handoff=Object.freeze({elapsedSeconds:at,position,velocity:hitVelocity,side,reason:'crossing'});
  }
 }
 let positionSpring:Spring|undefined,velocitySpring:Spring|undefined,decayRate=0,angularRate=0;
 if(handoff){
  const p=configured,product=finite(p.stiffness*p.mass,'Core spring stiffness/mass product');if(product<=0)fail('Core spring stiffness/mass product underflows Float64');
  const w0=finite(Math.sqrt(p.stiffness/p.mass),'spring frequency'),z=finite(p.damping/(2*Math.sqrt(product)),'spring damping ratio');
  if(w0<=0)fail('Spring frequency underflows Float64');
  // Core deliberately treats this narrow band as exactly critical. Reuse that convention for the derivative.
  const critical=z>=1-1e-8&&z<=1+1e-8,effectiveDamping=critical?2*w0:p.damping/p.mass;
  const x0=handoff.reason==='initial-outside'?from-handoff.position:0,initialVelocity=handoff.velocity;
  const acceleration=finite(-(p.stiffness/p.mass)*x0-effectiveDamping*initialVelocity,'spring initial acceleration');
  positionSpring=spring({from:handoff.reason==='initial-outside'?from:handoff.position,to:handoff.position,velocity:initialVelocity,stiffness:p.stiffness,damping:p.damping,mass:p.mass});
  // The derivative of a homogeneous damped response is another response with initial (v0,a0).
  // Both position and velocity use Core.springAt; no second spring kernel is implemented here.
  velocitySpring=spring({from:initialVelocity,to:0,velocity:acceleration,stiffness:p.stiffness,damping:p.damping,mass:p.mass});
  if(z<1-1e-8){decayRate=finite(z*w0,'spring decay rate');angularRate=finite(w0*Math.sqrt(1-z*z),'spring angular rate');}
  else if(critical)decayRate=w0;
  else{const root=finite(Math.sqrt(z*z-1),'overdamped root'),slow=finite(w0*(z-root),'slow spring decay'),fast=finite(w0*(z+root),'fast spring decay');if(slow<=0||fast<=slow)fail('Core spring modes are unresolved at these Float64 parameters');decayRate=slow;}
 }
 const sample=(context:FrameContext):InertiaSample=>{
  const fps=rational(context.fps),frame=finite(context.frame,'frame'),elapsed=finite((frame-start)*fps.den/fps.num,'elapsed seconds');
  if(elapsed<0)return {value:from,velocity:0,elapsedSeconds:elapsed,phase:'hold'};
  if(handoff&&elapsed>=handoff.elapsedSeconds){
   const local=elapsed-handoff.elapsedSeconds;if(local===0)return {value:handoff.reason==='initial-outside'?from:handoff.position,velocity:handoff.velocity,elapsedSeconds:elapsed,phase:'spring'};
   // Match Core's floating-point underflow semantics while avoiding 0*cos(Infinity) at very late queries.
   if(decayRate>0&&Math.exp(-decayRate*local)===0)return {value:handoff.position,velocity:0,elapsedSeconds:elapsed,phase:'spring'};
   if(angularRate>0&&Math.abs(angularRate*local)>Number.MAX_SAFE_INTEGER)fail('Spring phase exceeds Float64 cycle resolution');
   const springFrame=finite(local*fps.num/fps.den,'spring sample frame'),at={...context,frame:springFrame,fps};
   return {value:finite(springAt(positionSpring!,at),'spring value'),velocity:finite(springAt(velocitySpring!,at),'spring velocity'),elapsedSeconds:elapsed,phase:'spring'};
  }
  if(velocity===0)return {value:from,velocity:0,elapsedSeconds:elapsed,phase:'constant'};
  if(elapsed===0)return {value:from,velocity,elapsedSeconds:elapsed,phase:'decay'};
  const exponent=-elapsed/tau;
  // Motion's target-amplitude*exp form, expressed with expm1 to avoid near-start cancellation.
  return {value:finite(from-amplitude*Math.expm1(exponent),'decay value'),velocity:finite(velocity*Math.exp(exponent),'decay velocity'),elapsedSeconds:elapsed,phase:'decay'};
 };
 return Object.freeze({freeTarget,handoff,timeConstantSeconds:tau,startFrame:start,sample,valueAt:(context:FrameContext)=>sample(context).value,velocityAt:(context:FrameContext)=>sample(context).velocity});
}
