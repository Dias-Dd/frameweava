// SPDX-License-Identifier: Apache-2.0
import {createAim2D,type Aim2DOptions} from '../aim-2d.ts';
import type {FrameContext} from '../../../../src/core/types.ts';
import {point,unit,finite,fields,fail,type Point2D} from './common.ts';
import type {MotionSample2D} from './sampling.ts';
const noTime:FrameContext={frame:0,time:0,globalFrame:0,globalTime:0,dt:1,fps:{num:1,den:1},durationInFrames:1,progress:0,seed:0};
export interface MotionOrientationOptions {forwardDegrees?:number;offsetDegrees?:number;restDegrees?:number;weight?:number;limitsDegrees?:readonly [number,number];stationary?:'rest'|'error'}
/** Reuses the existing point-target aim contract, treating velocity as the direction vector. */
export function orientMotion2D(sample:Pick<MotionSample2D,'velocity'>,options:MotionOrientationOptions={}){
 fields(options,['forwardDegrees','offsetDegrees','restDegrees','weight','limitsDegrees','stationary']);const {stationary,...aim}=options;if(stationary!==undefined&&!['rest','error'].includes(stationary))fail('Known stationary orientation policy required');
 const velocity=point(sample.velocity),optionsForAim:Aim2DOptions={...aim,origin:[0,0],target:velocity,coincident:stationary==='error'?'error':'rest'};return createAim2D(optionsForAim).sample(noTime);
}
export interface MotionStretchOptions {referenceSpeed:number;amount?:number;maxScale?:number;preserveArea?:boolean}
/** Velocity-aligned length scale. Returned factors are ordinary Layer/mesh parameters. */
export function stretchMotion2D(sample:Pick<MotionSample2D,'velocity'>,options:MotionStretchOptions){
 fields(options,['referenceSpeed','amount','maxScale','preserveArea']);const v=point(sample.velocity),speed=finite(Math.hypot(...v),'speed'),reference=finite(options.referenceSpeed,'referenceSpeed'),amount=finite(options.amount??1,'amount'),max=options.maxScale??Infinity;
 if(reference<=0||amount<0||max<1||max!==Infinity&&!Number.isFinite(max)||options.preserveArea!==undefined&&typeof options.preserveArea!=='boolean')fail('Positive speed reference, nonnegative amount and maxScale >=1 required');
 const scaleX=Math.min(max,finite(1+amount*speed/reference,'stretch')),scaleY=options.preserveArea===false?1:1/scaleX;return Object.freeze({scaleX,scaleY,speed,areaScale:scaleX*scaleY});
}
export interface MotionBankOptions {referenceAcceleration:number;strength?:number;maxDegrees?:number;restDegrees?:number;minSpeed?:number}
/** Signed turn-bank control from lateral acceleration; not a torque/inertial solver. */
export function bankMotion2D(sample:Pick<MotionSample2D,'velocity'|'acceleration'>,options:MotionBankOptions){
 fields(options,['referenceAcceleration','strength','maxDegrees','restDegrees','minSpeed']);const v=point(sample.velocity),a=point(sample.acceleration),speed=finite(Math.hypot(...v),'speed'),reference=finite(options.referenceAcceleration,'referenceAcceleration'),strength=finite(options.strength??1,'strength'),max=finite(options.maxDegrees??60,'maxDegrees'),rest=finite(options.restDegrees??0,'rest'),min=finite(options.minSpeed??0,'minSpeed');
 if(reference<=0||max<0||min<0)fail('Positive acceleration reference and nonnegative limits required');if(speed<=min)return Object.freeze({rotationDegrees:rest,lateralAcceleration:0,status:'stationary' as const});
 const n=unit(v),lateral=finite(n[0]*a[1]-n[1]*a[0],'lateral acceleration'),requested=finite(Math.atan(lateral/reference)*180/Math.PI*strength,'bank'),rotation=finite(rest+Math.max(-max,Math.min(max,requested)),'bank rotation');return Object.freeze({rotationDegrees:rotation,lateralAcceleration:lateral,status:'banked' as const});
}
export interface LeadTargetOptions {speed:number;maxTimeSeconds?:number}
export interface LeadTargetResult {readonly status:'intercept'|'coincident'|'unreachable';readonly timeSeconds:number|null;readonly position:Point2D|null;readonly direction:Point2D|null}
/** Constant target velocity / constant pursuer speed, closed quadratic solution only.
 * This is an explicit prediction, not tracked observation, collision detection or simulation. */
export function leadTarget2D(origin:Point2D,target:Point2D,targetVelocity:Point2D,options:LeadTargetOptions):Readonly<LeadTargetResult>{
 fields(options,['speed','maxTimeSeconds']);const o=point(origin),p=point(target),v=point(targetVelocity),speed=finite(options.speed,'speed'),max=options.maxTimeSeconds??Infinity;if(speed<=0||max<0||max!==Infinity&&!Number.isFinite(max))fail('Positive pursuit speed and nonnegative horizon required');
 const r=point([p[0]-o[0],p[1]-o[1]]);if(r[0]===0&&r[1]===0)return Object.freeze({status:'coincident',timeSeconds:0,position:p,direction:null});
 const scale=Math.max(Math.abs(r[0]),Math.abs(r[1]),Math.abs(v[0]),Math.abs(v[1]),speed),rx=r[0]/scale,ry=r[1]/scale,vx=v[0]/scale,vy=v[1]/scale,s=speed/scale,a=vx*vx+vy*vy-s*s,b=2*(rx*vx+ry*vy),c=rx*rx+ry*ry;
 if(c===0)fail('Interception coordinate ratio is below Float64 squared resolution');let times:number[]=[];
 if(a===0){if(b!==0)times=[-c/b];}
 else{const discriminant=b*b-4*a*c;if(discriminant>=0){const root=Math.sqrt(discriminant),q=-.5*(b+(b<0?-root:root));times=q===0?[-b/(2*a)]:[q/a,c/q];}}
 const candidates=times.filter(t=>Number.isFinite(t)&&t>=0&&t<=max);if(!candidates.length)return Object.freeze({status:'unreachable',timeSeconds:null,position:null,direction:null});
 const t=Math.min(...candidates),hit=point([p[0]+v[0]*t,p[1]+v[1]*t]),delta=point([hit[0]-o[0],hit[1]-o[1]]);return Object.freeze({status:'intercept',timeSeconds:t,position:hit,direction:delta[0]===0&&delta[1]===0?null:unit(delta)});
}
