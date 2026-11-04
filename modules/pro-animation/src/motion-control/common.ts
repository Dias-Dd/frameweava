// SPDX-License-Identifier: Apache-2.0
import {EngineError} from '../../../../src/core/errors.ts';
import {evaluate} from '../../../../src/core/animation.ts';
import type {FrameContext,Signal} from '../../../../src/core/types.ts';
import type {Vec2} from '../../../graphics-contracts/types.ts';
export type Point2D=Readonly<Vec2>;
/** Ordinary pure TypeScript callback, not a Signal/IR variant, rig or timeline. */
export type MotionSource2D=(context:FrameContext)=>Point2D;
export type AnimatedPoint2D=readonly [Signal<number>,Signal<number>];
export const fail=(message:string):never=>{throw new EngineError('E_PA_MOTION_CONTROL',message);};
export function finite(n:number,name:string){if(typeof n!=='number'||!Number.isFinite(n))fail(name+' must be finite');return n;}
export function fields(v:object,allowed:readonly string[]){if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!allowed.includes(k)))fail('Use documented motion options');}
export function point(v:Point2D,name='point'):Point2D{if(!Array.isArray(v)||v.length!==2)fail(name+' needs two coordinates');return Object.freeze([finite(v[0],name+'.x'),finite(v[1],name+'.y')]) as Point2D;}
export function scalar(v:Signal<number>,c:FrameContext,name:string){return finite(evaluate(v,c),name);}
export function animated(v:AnimatedPoint2D,c:FrameContext,name:string):Point2D{if(!Array.isArray(v)||v.length!==2)fail(name+' needs two existing numeric Signals');return point([scalar(v[0],c,name+'.x'),scalar(v[1],c,name+'.y')]);}
export function source(v:MotionSource2D){if(typeof v!=='function')fail('Expected a pure position callback');return v;}
export function snapshot<T>(v:T):T{try{return structuredClone(v);}catch{return fail('Use cloneable existing Signals and options');}}
export function unit(v:Point2D,name='direction'):Point2D{const p=point(v,name),m=Math.max(Math.abs(p[0]),Math.abs(p[1]));if(m===0)fail(name+' must be nonzero');const x=p[0]/m,y=p[1]/m,n=Math.hypot(x,y);return point([x/n,y/n]);}
export function angle(degrees:number){finite(degrees,'angle');if(Math.abs(degrees/360)>Number.MAX_SAFE_INTEGER)fail('Angle exceeds Float64 cycle resolution');return (degrees%360)*Math.PI/180;}
export function phase(time:number,frequency:number,offset:number){finite(time,'time');finite(frequency,'frequency');finite(offset,'phaseDegrees');const cycles=time*frequency+offset/360;if(!Number.isFinite(cycles)||Math.abs(cycles)>Number.MAX_SAFE_INTEGER)fail('Motion phase exceeds Float64 cycle resolution');return (cycles%1)*2*Math.PI;}
export interface PointConstraint2D {readonly position:Point2D;readonly correction:Point2D;readonly changed:boolean;readonly status:'unchanged'|'projected'|'degenerate-rest'}
export function constraint(original:Point2D,result:Point2D,rest=false):Readonly<PointConstraint2D>{const p=point(original),q=point(result),correction=point([q[0]-p[0],q[1]-p[1]]),changed=p[0]!==q[0]||p[1]!==q[1];return Object.freeze({position:q,correction,changed,status:rest?'degenerate-rest':changed?'projected':'unchanged'});}
