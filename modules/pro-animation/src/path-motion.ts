// SPDX-License-Identifier: Apache-2.0
// Motion semantics only. Prepared original kurbo geometry + existing Core Signal/speed integration.
import {EngineError} from '../../../src/core/errors.ts';
import {evaluate} from '../../../src/core/animation.ts';
import {rational} from '../../../src/core/time.ts';
import type {FrameContext,Keyframes,Signal,Diagnostic} from '../../../src/core/types.ts';
import type {createCurveSampler,CurveSample} from './curve-sampler.ts';
import {createSpeedRamp,remapTime} from './time-controls.ts';

type CurveReader=Pick<Awaited<ReturnType<typeof createCurveSampler>>,'coordinates'|'metrics'|'sampleBatch'>;
type Driver=
 | {distance:Signal<number>;progress?:never;speed?:never;startDistance?:never;originFrame?:never}
 | {progress?:Signal<number>;distance?:never;speed?:never;startDistance?:never;originFrame?:never}
 | {speed:Keyframes<number>;distance?:never;progress?:never;startDistance?:number;originFrame?:number};
export type PathMotionOptions=Driver & {
 contour?:number;boundary?:'error'|'clamp'|'wrap'|'ping-pong';side?:'incoming'|'outgoing';
 /** travel follows signed CENTERLINE distance, not an independently animated normal offset. */
 orient?:'tangent'|'travel'|'upright';stationary?:'tangent'|'error';
 normalOffset?:Signal<number>;rotation?:Signal<number>;
};
export type PathVelocityStatus='unknown-driver'|'stationary'|'clamped'|'boundary'|'turn'|'driver-jump'|'one-sided'|'smooth'|'tangent-undefined';
export interface PathMotionPose {
 readonly frame:number;readonly requestedDistance:number;readonly distance:number;
 readonly position:readonly [number,number];readonly rotation:number;readonly normalOffset:number;
 readonly sample:Readonly<CurveSample>;
 /** Present only for the integrated speed driver or a literal constant distance/progress. */
 readonly driverVelocity:number|undefined;
 readonly distanceVelocity:number|undefined;
 /** Derivative of centerline position only. Does NOT differentiate the offset curve/normal Signal. */
 readonly centerlineVelocity:readonly [number,number]|undefined;
 readonly velocityStatus:PathVelocityStatus;readonly diagnostics:readonly Diagnostic[];
}
export interface PathMotionQuery {signal?:AbortSignal}
function fail(code:string,message:string,details?:unknown):never{throw new EngineError(code,message,{details});}
function finite(n:number,name:string){if(typeof n!=='number'||!Number.isFinite(n))fail('E_PA_PATH_MOTION_PARAMETER',`${name} must be finite`);return n;}
function keys(value:unknown,names:string[]){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!names.includes(k)))fail('E_PA_PATH_MOTION_PARAMETER','Only documented option fields are allowed');}
function snapshot<T extends Signal<number>>(value:T):T{if(typeof value==='number')finite(value,'Signal');try{return structuredClone(value);}catch{fail('E_PA_PATH_MOTION_PARAMETER','Use cloneable existing Core Signal values');}}

/** Borrowed prepared curve, immutable controls, no owned Worker, frame history, new Signal or Runner. */
export function createPathMotion(curve:CurveReader,options:PathMotionOptions={}){
 keys(options,['distance','progress','speed','startDistance','originFrame','contour','boundary','side','orient','stationary','normalOffset','rotation']);
 const supplied=['distance','progress','speed'].filter(k=>Reflect.get(options,k)!==undefined);if(supplied.length>1)fail('E_PA_PATH_MOTION_DRIVER','Choose one distance, progress or speed driver');
 const kind=supplied[0]??'progress',contour=options.contour??(curve.metrics.contours.length===1?0:undefined),boundary=options.boundary??'error',side=options.side??'outgoing',orient=options.orient??'tangent',stationary=options.stationary??'tangent';
 if(contour===undefined||!Number.isInteger(contour)||contour<0||contour>=curve.metrics.contours.length)fail('E_PA_PATH_MOTION_CONTOUR','Select one existing contour explicitly');
 const metric=Object.freeze({...curve.metrics.contours[contour]}),length=finite(metric.length,'contour length');if(length<=0)fail('E_PA_PATH_MOTION_DEGENERATE','Path motion needs positive contour length');
 if(curve.coordinates.unit!=='px')fail('E_PA_PATH_MOTION_SPACE','Use the prepared physical-pixel curve contract');
 if(!['error','clamp','wrap','ping-pong'].includes(boundary)||!['incoming','outgoing'].includes(side)||!['tangent','travel','upright'].includes(orient)||!['tangent','error'].includes(stationary))fail('E_PA_PATH_MOTION_PARAMETER','Known boundary/orientation policies required');
 if(boundary==='wrap'&&!metric.closed)fail('E_PA_PATH_MOTION_CLOSURE','Wrap requires a closed contour; use ping-pong for an open path');
 if(kind!=='speed'&&(options.startDistance!==undefined||options.originFrame!==undefined))fail('E_PA_PATH_MOTION_DRIVER','startDistance/originFrame belong to the integrated speed driver');
 const driver=kind==='distance'?snapshot(options.distance!):kind==='progress'&&options.progress!==undefined?snapshot(options.progress):undefined;
 // Unit adapter: one numeric source-second of the existing integral represents one path px.
 // The actual Stage context/time is never replaced; no second integration or time system is added.
 const ramp=kind==='speed'?createSpeedRamp(options.speed!,{originFrame:options.originFrame,sourceTime:options.startDistance}):undefined;
 // Core ramp owns the immutable keyframe snapshot; retain only jump-frame identities here.
 const speedJumps=new Set(kind==='speed'?options.speed!.$keyframes.flatMap((k,i,keys)=>i&&k.easing==='step'&&k.value!==keys[i-1].value?[k.frame]:[]):[]);
 const normalSignal=snapshot(options.normalOffset??0),rotationSignal=snapshot(options.rotation??0),coordinates=Object.freeze({...curve.coordinates});
 const scalar=(s:Signal<number>,ctx:FrameContext,name:string)=>finite(evaluate(s,ctx),name);
 const resolve=(context:FrameContext)=>{
  finite(context.frame,'frame');rational(context.fps);
  const requested=finite(ramp?ramp.timeAt(context):kind==='distance'?scalar(driver!,context,'distance'):scalar(driver??context.progress,context,'progress')*length,'requested distance');
  const speed=ramp?finite(ramp.speedAt(context),'driver speed'):typeof driver==='number'?0:undefined;
  if(boundary==='error'&&(requested<0||requested>length))fail('E_PA_PATH_MOTION_RANGE','Requested distance exceeds selected contour',{distance:requested,length,contour});
  const distance=boundary==='error'?requested:remapTime({time:requested,start:0,duration:length,mode:boundary==='wrap'?'loop':boundary},context);
  const outside=requested<0||requested>length,endpoint=distance===0||distance===length;
  let velocity=speed,status:PathVelocityStatus=speed===undefined?'unknown-driver':speedJumps.has(context.frame)?'driver-jump':speed===0?'stationary':'smooth';
  if(speed!==undefined&&speed!==0){
   if(boundary==='clamp'&&outside){velocity=0;status='clamped';}
   else if(boundary==='clamp'&&endpoint){velocity=undefined;status='boundary';}
   else if(boundary==='ping-pong'){
    if(endpoint){velocity=undefined;status='turn';}
    else{const cycle=Math.floor(requested/length);velocity=finite(speed*(Math.abs(cycle%2)===1?-1:1),'mapped speed');}
   }
  }
  // At a closed wrap seam incoming selects the actual last endpoint tangent, not the first edge.
  const queryDistance=boundary==='wrap'&&distance===0&&side==='incoming'?length:distance;
  return {frame:context.frame,requested,distance,queryDistance,driverVelocity:speed,velocity,status,normal:scalar(normalSignal,context,'normalOffset'),extraRotation:scalar(rotationSignal,context,'rotation')};
 };
 type Resolved=ReturnType<typeof resolve>;
 const pose=(r:Resolved,s:CurveSample):PathMotionPose=>{
  const tangent=s.tangent,defined=s.tangentStatus!=='undefined',diagnostics:Diagnostic[]=[];
  if(!defined&&(r.normal!==0||orient!=='upright'))fail('E_PA_PATH_MOTION_TANGENT','Selected pose needs a defined tangent; upright with zero normal can still sample position',{contour,distance:r.distance,segment:s.segment});
  let rotation=r.extraRotation;
  if(orient!=='upright'){
   rotation+=s.angleRadians!;
   if(orient==='travel'){
    if(r.driverVelocity===undefined)fail('E_PA_PATH_MOTION_DIRECTION','travel requires integrated speed or a literal constant driver; arbitrary Signal derivatives are not inferred');
    if(r.velocity===undefined||r.velocity===0){
     if(stationary==='error')fail('E_PA_PATH_MOTION_DIRECTION','Travel direction is undefined at a stop, clamp boundary or ping-pong turn',{status:r.status});
     diagnostics.push({code:'W_PA_PATH_MOTION_STATIONARY',severity:'warning',message:'No unique instantaneous travel direction; explicit stationary policy uses the path tangent',details:{status:r.status}});
    }else if(r.velocity<0)rotation+=Math.PI;
   }
  }
  const position=Object.freeze([finite(s.x-tangent[1]*r.normal,'pose x'),finite(s.y+tangent[0]*r.normal,'pose y')]) as readonly [number,number];
  const centerlineVelocity=r.velocity===0?Object.freeze([0,0]) as readonly [number,number]:r.velocity!==undefined&&defined?Object.freeze([finite(tangent[0]*r.velocity,'velocity x'),finite(tangent[1]*r.velocity,'velocity y')]) as readonly [number,number]:undefined;
  const status=r.status==='smooth'?defined?s.parameter===0||s.parameter===1?'one-sided':'smooth':'tangent-undefined':r.status;
  return Object.freeze({frame:r.frame,requestedDistance:r.requested,distance:r.distance,position,rotation:finite(rotation,'rotation'),normalOffset:r.normal,sample:Object.freeze({...s,tangent:Object.freeze([...tangent]) as readonly [number,number]}),driverVelocity:r.driverVelocity,distanceVelocity:r.velocity,centerlineVelocity,velocityStatus:status,diagnostics:Object.freeze(diagnostics)});
 };
 const check=(query:PathMotionQuery)=>{if(query.signal?.aborted)fail('E_PA_PATH_MOTION_CANCELLED','Path motion query cancelled');};
 async function* sampleStream(contexts:Iterable<FrameContext>,query:PathMotionQuery={}):AsyncGenerator<PathMotionPose>{
  keys(query,['signal']);check(query);if(!contexts||typeof contexts[Symbol.iterator]!=='function')fail('E_PA_PATH_MOTION_PARAMETER','Expected iterable FrameContexts');
  let batch:Resolved[]=[];
  const decode=async(rows:Resolved[])=>{check(query);const samples=await curve.sampleBatch(rows.map(r=>r.queryDistance),{contour,boundary:'error',side,signal:query.signal});check(query);if(samples.length!==rows.length)fail('E_PA_PATH_MOTION_OUTPUT','Incomplete curve sample batch');return rows.map((r,i)=>pose(r,samples[i]));};
  for(const context of contexts){check(query);batch.push(resolve(context));if(batch.length===1024){for(const p of await decode(batch)){check(query);yield p;}batch=[];}}
  if(batch.length)for(const p of await decode(batch)){check(query);yield p;}
 }
 return Object.freeze({coordinates,contour,metric,boundary,orient,sampleStream,
  async sampleBatch(contexts:readonly FrameContext[],query:PathMotionQuery={}){if(!Array.isArray(contexts))fail('E_PA_PATH_MOTION_PARAMETER','Batch needs an explicit ordered array');const result:PathMotionPose[]=[];for await(const p of sampleStream(contexts,query))result.push(p);return result;},
  async sample(context:FrameContext,query:PathMotionQuery={}){const result:PathMotionPose[]=[];for await(const p of sampleStream([context],query))result.push(p);return result[0];},
 });
}
