// SPDX-License-Identifier: Apache-2.0
// Stateless point-target orientation, not a spatial/IK solver or a new Signal type.
import {evaluate} from '../../../src/core/animation.ts';
import {EngineError} from '../../../src/core/errors.ts';
import type {FrameContext,Signal} from '../../../src/core/types.ts';
import type {Vec2} from '../../graphics-contracts/types.ts';
type AnimatedPoint=readonly [Signal<number>,Signal<number>];
export interface Aim2DOptions {
 /** Same Stage-local physical-pixel coordinates: +x right, +y down. */
 origin:AnimatedPoint;target:AnimatedPoint;
 /** Local forward axis, clockwise degrees from +x. Default0. */
 forwardDegrees?:Signal<number>;
 offsetDegrees?:Signal<number>;restDegrees?:Signal<number>;
 /** Shortest-arc blend from rest, finite [0,1]. Default1. */
 weight?:Signal<number>;
 /** Signed shortest-arc offsets relative to rest, inclusive, inside [-180,180]. */
 limitsDegrees?:readonly [number,number];
 /** Coincident points have no direction. Default rest; never hold a previous frame. */
 coincident?:'rest'|'error';
}
export interface Aim2DSample {
 readonly origin:Readonly<Vec2>;readonly target:Readonly<Vec2>;
 readonly direction:Readonly<Vec2>|null;readonly distance:number;
 /** Clockwise degrees, ready for the existing Layer rotation property. */
 readonly rotationDegrees:number;readonly requestedOffsetDegrees:number|null;
 readonly appliedOffsetDegrees:number;readonly weight:number;
 readonly status:'aimed'|'limited'|'coincident';
}
function fail(message:string):never{throw new EngineError('E_PA_AIM',message);}
function finite(value:number,name:string){if(typeof value!=='number'||!Number.isFinite(value))fail(`${name} must be finite`);return value;}
function snapshot(value:Signal<number>):Signal<number>{try{return structuredClone(value);}catch{fail('Use cloneable existing Core Signals');}}
/** Reuse standard atan2/principal-angle geometry and Core Signal evaluation; no external runtime. */
export function createAim2D(options:Aim2DOptions){
 if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(k=>!['origin','target','forwardDegrees','offsetDegrees','restDegrees','weight','limitsDegrees','coincident'].includes(k)))fail('Use only documented aim options');
 const point=(p:AnimatedPoint,name:string)=>{if(!Array.isArray(p)||p.length!==2)fail(`${name} needs two existing numeric Signals`);return p.map(snapshot) as [Signal<number>,Signal<number>];};
 const origin=point(options.origin,'origin'),target=point(options.target,'target'),forward=snapshot(options.forwardDegrees??0),offset=snapshot(options.offsetDegrees??0),rest=snapshot(options.restDegrees??0),weight=snapshot(options.weight??1),coincident=options.coincident??'rest';
 if(coincident!=='rest'&&coincident!=='error')fail('Unknown coincident policy');
 if(options.limitsDegrees!==undefined&&!Array.isArray(options.limitsDegrees))fail('limitsDegrees needs two finite numbers');
 const limits=options.limitsDegrees===undefined?undefined:[...options.limitsDegrees];
 if(limits&&(limits.length!==2||limits.some(v=>typeof v!=='number'||!Number.isFinite(v))||limits[0]<-180||limits[1]>180||limits[0]>limits[1]))fail('limitsDegrees must be an ordered interval inside [-180,180]');
 const principal=(a:number)=>{const phase=finite(a,'angle');if(Math.abs(phase/360)>Number.MAX_SAFE_INTEGER)fail('Angle phase exceeds Float64 cycle resolution');let r=phase%360;if(r< -180)r+=360;if(r>=180)r-=360;return r===0?0:r;};
 const sample=(context:FrameContext):Readonly<Aim2DSample>=>{
  const value=(s:Signal<number>,name:string)=>finite(evaluate(s,context),name),o=Object.freeze(origin.map(s=>value(s,'origin')) as Vec2),t=Object.freeze(target.map(s=>value(s,'target')) as Vec2);
  const r=value(rest,'restDegrees'),f=value(forward,'forwardDegrees'),extra=value(offset,'offsetDegrees'),w=value(weight,'weight');
  if(w<0||w>1)fail('weight must be inside [0,1]');principal(r);principal(f);principal(extra);
  const dx=finite(t[0]-o[0],'delta x'),dy=finite(t[1]-o[1],'delta y'),scale=Math.max(Math.abs(dx),Math.abs(dy));
  if(scale===0){if(coincident==='error')fail('Coincident aim points have no direction');return Object.freeze({origin:o,target:t,direction:null,distance:0,rotationDegrees:r,requestedOffsetDegrees:null,appliedOffsetDegrees:0,weight:w,status:'coincident'});}
  // Scale first: normalizing a subnormal hypot directly can produce a non-unit vector.
  const x=dx/scale,y=dy/scale,length=Math.hypot(x,y),direction=Object.freeze([x/length,y/length] as Vec2),distance=finite(scale*length,'distance');
  const requested=principal(Math.atan2(y,x)*180/Math.PI-principal(f)+principal(extra)-principal(r));
  const limited=limits?Math.max(limits[0],Math.min(limits[1],requested)):requested,applied=finite(limited*w,'weighted angular offset'),rotation=finite(r+applied,'rotationDegrees');
  if(applied!==0&&rotation===r)fail('Weighted rotation is below Float64 angle resolution at rest');
  return Object.freeze({origin:o,target:t,direction,distance,rotationDegrees:rotation,requestedOffsetDegrees:requested,appliedOffsetDegrees:applied,weight:w,status:limited===requested?'aimed':'limited'});
 };
 return Object.freeze({sample,rotationAt:(context:FrameContext)=>sample(context).rotationDegrees});
}
