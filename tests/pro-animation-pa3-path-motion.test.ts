import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import * as graphics from '../modules/graphics-contracts/index.ts';
import {createCurveSampler} from '../modules/pro-animation/src/curve-sampler.ts';
import {createPathMotion} from '../modules/pro-animation/src/path-motion.ts';
import {keyframes} from '../src/core/animation.ts';
import type {FrameContext} from '../src/core/types.ts';
import {directCurveFactory,curvePath} from './helpers/pa3-curve.ts';
const context=(frame:number):FrameContext=>({frame,time:frame/10,globalFrame:99,globalTime:99,dt:.1,progress:frame/10,fps:{num:10,den:1},durationInFrames:11,seed:17});
const line=()=>createCurveSampler(graphics,directCurveFactory,curvePath([['M',10,20],['L',110,20]]));
const square=()=>createCurveSampler(graphics,directCurveFactory,curvePath([['M',0,0],['L',10,0],['L',10,10],['L',0,10],['Z']]));
const close=(a:number,b:number,budget=1e-10)=>assert.ok(Math.abs(a-b)<=budget,`${a} vs ${b} within ${budget}`);

test('distance/progress/default Stage progress reuse original line metric; normal/rotation/Signal controls do not mutate context',async()=>{
 const curve=await line();try{
  const c=context(5),saved=structuredClone(c),motion=createPathMotion(curve,{distance:keyframes([{frame:0,value:0},{frame:10,value:100}]),normalOffset:4,rotation:keyframes([{frame:0,value:0},{frame:10,value:Math.PI}])}),p=await motion.sample(c);
  assert.deepEqual(p.position,[60,24]);close(p.rotation,Math.PI/2);assert.equal(p.distance,50);assert.equal(p.velocityStatus,'unknown-driver');assert.equal(p.centerlineVelocity,undefined);assert.deepEqual(c,saved);
  assert.deepEqual((await createPathMotion(curve).sample(c)).position,[60,20]);assert.deepEqual((await createPathMotion(curve,{progress:.5}).sample(c)).centerlineVelocity,[0,0]);
  const signal=keyframes<number>([{frame:0,value:0},{frame:10,value:1}]),frozen=createPathMotion(curve,{progress:signal});signal.$keyframes[1].value=100;assert.deepEqual((await frozen.sample(c)).position,[60,20]);
  await assert.rejects(createPathMotion(curve,{progress:keyframes([{frame:0,value:0},{frame:10,value:1}]),orient:'travel'}).sample(c),{code:'E_PA_PATH_MOTION_DIRECTION'});
 }finally{await curve.dispose();}
});

test('Core speed-keyframe integral supplies arc-distance and velocity with independent line kinematics and frozen initial conditions',async()=>{
 const curve=await line(),records:any[]=[];try{
  const speed=keyframes<number>([{frame:0,value:0},{frame:10,value:100}]),motion=createPathMotion(curve,{speed,startDistance:20,orient:'travel'});speed.$keyframes[1].value=10000;
  for(const frame of [0,1,3,5,7,10]){const t=frame/10,p=await motion.sample(context(frame)),expectedDistance=20+50*t*t,expectedSpeed=100*t;close(p.distance,expectedDistance);close(p.position[0],10+expectedDistance);close(p.driverVelocity!,expectedSpeed);assert.deepEqual(p.centerlineVelocity,[expectedSpeed,0]);records.push({frame,position:p.position,distance:p.distance,expectedDistance,distanceError:Math.abs(p.distance-expectedDistance),velocity:p.centerlineVelocity,expectedSpeed});}
  const reverse=createPathMotion(curve,{speed:keyframes([{frame:0,value:-20}]),startDistance:75,orient:'travel'}),r=await reverse.sample(context(10));assert.deepEqual(r.position,[65,20]);close(r.rotation,Math.PI);assert.deepEqual(r.centerlineVelocity,[-20,-0]);
  const shifted=createPathMotion(curve,{speed:keyframes([{frame:0,value:10}]),startDistance:40,originFrame:5});assert.equal((await shifted.sample(context(5))).distance,40);assert.equal((await shifted.sample(context(0))).distance,35);
  const step=createPathMotion(curve,{speed:keyframes([{frame:0,value:20},{frame:10,value:-10,easing:'step'}]),startDistance:20,orient:'travel'}),jump=await step.sample(context(10));assert.equal(jump.velocityStatus,'driver-jump');assert.equal(jump.distance,40);assert.equal(jump.distanceVelocity,-10);close(jump.rotation,Math.PI);const h=1e-4,next=await step.sample(context(10+h));close((next.position[0]-jump.position[0])/(h/10),-10,2e-7);
 }finally{await curve.dispose();}
 await mkdir('.frameweave/pa3-path-motion',{recursive:true});await writeFile('.frameweave/pa3-path-motion/numeric-proof.json',JSON.stringify({reference:'Independent straight-line constant-acceleration x=x0+v0*t+a*t*t/2; no curve solver/ramp used by reference',distanceBudget:1e-10,records},null,2));
});

test('clamp stop/boundary and ping-pong turn are explicit; travel uses signed centerline direction without query history',async()=>{
 const curve=await line();try{
  const speed=keyframes([{frame:0,value:100}]),clamp=createPathMotion(curve,{speed,boundary:'clamp',orient:'travel'}),outside=await clamp.sample(context(20));assert.equal(outside.velocityStatus,'clamped');assert.deepEqual(outside.centerlineVelocity,[0,0]);assert.equal(outside.diagnostics[0].code,'W_PA_PATH_MOTION_STATIONARY');
  const endpoint=await clamp.sample(context(10));assert.equal(endpoint.velocityStatus,'boundary');assert.equal(endpoint.distanceVelocity,undefined);assert.equal(endpoint.centerlineVelocity,undefined);
  await assert.rejects(createPathMotion(curve,{speed,boundary:'clamp',orient:'travel',stationary:'error'}).sample(context(20)),{code:'E_PA_PATH_MOTION_DIRECTION'});
  const ping=createPathMotion(curve,{speed:keyframes([{frame:0,value:80}]),boundary:'ping-pong',orient:'travel'}),a=await ping.sample(context(15)),b=await ping.sample(context(-2.5));assert.equal(a.distance,80);assert.deepEqual(a.centerlineVelocity,[-80,-0]);close(a.rotation,Math.PI);assert.equal(b.distance,20);assert.deepEqual(b.centerlineVelocity,[-80,-0]);
  const turn=await ping.sample(context(12.5));assert.equal(turn.velocityStatus,'turn');assert.equal(turn.distanceVelocity,undefined);assert.ok(turn.diagnostics.length>0);
  const before=await ping.sample(context(2));await ping.sample(context(50));assert.deepEqual(await ping.sample(context(2)),before);
 }finally{await curve.dispose();}
});

test('closed wrap seam selects true incoming/outgoing edge; open wraps and ambiguous contours diagnose instead of teleporting',async()=>{
 const curve=await square();try{
  const input={speed:keyframes([{frame:0,value:10}]),startDistance:35,boundary:'wrap' as const},incoming=createPathMotion(curve,{...input,side:'incoming'}),outgoing=createPathMotion(curve,{...input,side:'outgoing'}),a=await incoming.sample(context(5)),b=await outgoing.sample(context(5));
  assert.equal(a.distance,0);assert.equal(a.sample.distance,40);assert.equal(b.sample.distance,0);assert.deepEqual(a.position,b.position);assert.deepEqual(a.sample.tangent,[0,-1]);assert.deepEqual(b.sample.tangent,[1,0]);close(a.rotation,-Math.PI/2);assert.equal(a.velocityStatus,'one-sided');
  const wrap=await outgoing.sample(context(10));assert.equal(wrap.distance,5);assert.deepEqual(wrap.position,[5,0]);
  const negative=await createPathMotion(curve,{distance:-5,boundary:'wrap'}).sample(context(0));assert.equal(negative.distance,35);assert.deepEqual(negative.position,[0,5]);
 }finally{await curve.dispose();}
 const open=await line();try{assert.throws(()=>createPathMotion(open,{boundary:'wrap'}),{code:'E_PA_PATH_MOTION_CLOSURE'});}finally{await open.dispose();}
 const multi=await createCurveSampler(graphics,directCurveFactory,curvePath([['M',0,0],['L',10,0],['M',20,20],['L',30,20]]));try{assert.throws(()=>createPathMotion(multi),{code:'E_PA_PATH_MOTION_CONTOUR'});assert.deepEqual((await createPathMotion(multi,{contour:1,progress:.5}).sample(context(0))).position,[25,20]);}finally{await multi.dispose();}
});

test('curved spatial velocity is a centerline derivative; tangent and offset semantics match independent analytic quadratic direction',async()=>{
 const curve=await createCurveSampler(graphics,directCurveFactory,curvePath([['M',0,0],['Q',50,100,100,0]]));try{
  const motion=createPathMotion(curve,{speed:keyframes([{frame:0,value:20}]),startDistance:10,normalOffset:6});
  for(const frame of [1,5,10,20]){const p=await motion.sample(context(frame)),t=p.sample.parameter,dx=100,dy=200*(1-2*t),norm=Math.hypot(dx,dy);close(p.sample.tangent[0],dx/norm,1e-12);close(p.sample.tangent[1],dy/norm,1e-12);close(p.centerlineVelocity![0],20*dx/norm,1e-10);close(p.centerlineVelocity![1],20*dy/norm,1e-10);close(Math.hypot(...p.centerlineVelocity!),20,1e-10);close(p.position[0],p.sample.x-6*dy/norm);close(p.position[1],p.sample.y+6*dx/norm);}
 }finally{await curve.dispose();}
 const cusp=await createCurveSampler(graphics,directCurveFactory,curvePath([['M',0,0],['Q',100,0,0,0]]));try{
  await assert.rejects(createPathMotion(cusp,{distance:50}).sample(context(0)),{code:'E_PA_PATH_MOTION_TANGENT'});
  const p=await createPathMotion(cusp,{distance:50,orient:'upright'}).sample(context(0));close(p.position[0],50,1e-6);assert.deepEqual(p.centerlineVelocity,[0,0]);
  await assert.rejects(createPathMotion(cusp,{distance:50,orient:'upright',normalOffset:1}).sample(context(0)),{code:'E_PA_PATH_MOTION_TANGENT'});
 }finally{await cusp.dispose();}
});

test('ordered/repeated batches and lazy streams preserve poses, early close leaves borrowed immutable curve usable',async()=>{
 const curve=await line();try{
  const motion=createPathMotion(curve,{progress:keyframes([{frame:0,value:0},{frame:10,value:1}])}),order=[10,0,3.5,10,0],poses=await motion.sampleBatch(order.map(context));assert.deepEqual(poses[0],poses[3]);assert.deepEqual(poses[1],poses[4]);assert.deepEqual(poses.map(p=>p.frame),order);
  const many=await motion.sampleBatch(Array.from({length:3000},(_,i)=>context(i%11)));assert.equal(many.length,3000);assert.deepEqual(many[5],many[2997]);
  let produced=0;const contexts=function*(){for(;;){produced++;yield context(5);}},iterator=motion.sampleStream(contexts());assert.equal((await iterator.next()).done,false);assert.equal(produced,1024,'Transport chunk, not a public total-count cap');await iterator.return(undefined);assert.deepEqual((await motion.sample(context(5))).position,[60,20]);
  const first=motion.sample(context(0));await assert.rejects(motion.sample(context(1)),{code:'E_PA_CURVE_BUSY'});await first;
  const lateError=motion.sampleStream([...Array.from({length:1024},()=>context(5)),context(NaN)]);for(let i=0;i<1024;i++)assert.equal((await lateError.next()).done,false);await assert.rejects(lateError.next(),{code:'E_PA_PATH_MOTION_PARAMETER'});assert.deepEqual((await motion.sample(context(5))).position,[60,20]);
  assert.ok(Object.isFrozen(poses[0]));assert.ok(Object.isFrozen(poses[0].position));assert.ok(Object.isFrozen(motion.metric));
 }finally{await curve.dispose();}
});

test('pre-abort and between-chunk abort preserve borrowed geometry; active kurbo query cancellation retains underlying terminal state',async()=>{
 const curve=await line();try{
  const motion=createPathMotion(curve,{distance:5}),pre=new AbortController();pre.abort();await assert.rejects(motion.sample(context(0),{signal:pre.signal}),{code:'E_PA_PATH_MOTION_CANCELLED'});assert.equal((await curve.sample(5)).x,15);
  const controller=new AbortController(),iterator=motion.sampleStream(Array.from({length:2000},()=>context(0)),{signal:controller.signal});await iterator.next();controller.abort();await assert.rejects(iterator.next(),{code:'E_PA_PATH_MOTION_CANCELLED'});assert.equal((await curve.sample(5)).x,15);
  const active=new AbortController(),pending=motion.sampleBatch(Array.from({length:3000},()=>context(0)),{signal:active.signal});active.abort();await assert.rejects(pending,{code:'E_PA_CURVE_CANCELLED'});assert.equal((await curve.diagnostics()).closed,true);
 }finally{assert.deepEqual(await curve.dispose(),{mode:'terminated'});}
});

test('invalid drivers, units, policies, values, numeric phase and disposed readers propagate explicit errors',async()=>{
 const curve=await line();try{
  for(const [bad,code] of [[null,'PARAMETER'],[[],'PARAMETER'],[{distance:0,progress:0},'DRIVER'],[{speed:keyframes([{frame:0,value:1}]),distance:0},'DRIVER'],[{distance:0,startDistance:1},'DRIVER'],[{originFrame:0},'DRIVER'],[{boundary:'teleport'},'PARAMETER'],[{side:'other'},'PARAMETER'],[{orient:'auto'},'PARAMETER'],[{stationary:'previous'},'PARAMETER'],[{contour:99},'CONTOUR'],[{x:1},'PARAMETER'],[{distance:NaN},'PARAMETER']] as const)assert.throws(()=>createPathMotion(curve,bad as any),{code:'E_PA_PATH_MOTION_'+code});
  const motion=createPathMotion(curve,{distance:101});await assert.rejects(motion.sample(context(0)),{code:'E_PA_PATH_MOTION_RANGE'});
  await assert.rejects(createPathMotion(curve,{distance:1e30,boundary:'ping-pong'}).sample(context(0)),{code:'E_PA_TIME'});
  await assert.rejects(createPathMotion(curve).sample({...context(0),progress:NaN}),{code:'E_PA_PATH_MOTION_PARAMETER'});
  await assert.rejects(createPathMotion(curve).sample({...context(0),fps:{num:0,den:1}}),{code:'E_TIME'});
  await assert.rejects(createPathMotion(curve).sampleBatch(null as any),{code:'E_PA_PATH_MOTION_PARAMETER'});
  const borrowed=createPathMotion(curve);await curve.dispose();await assert.rejects(borrowed.sample(context(0)),{code:'E_PA_CURVE_CLOSED'});
 }finally{await curve.dispose();}
 const zero=await createCurveSampler(graphics,directCurveFactory,curvePath([['M',0,0]]));try{assert.throws(()=>createPathMotion(zero),{code:'E_PA_PATH_MOTION_DEGENERATE'});}finally{await zero.dispose();}
});
