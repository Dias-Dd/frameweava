import test from 'node:test';
import assert from 'node:assert/strict';
import {keyframes} from '../src/core/animation.ts';
import type {FrameContext} from '../src/core/types.ts';
import {sourceTimeContext,shutterTimeContext,resolveTimeRange,frameBlendSamples,echoSamples,trailSamples,wideTimeSamples,shutterTimeSamples,freezeTimeRange,reverseTimeRange,jitterTime,strobeTime} from '../modules/pro-animation/src/native-time/plans.ts';
import {shutterSamples} from '../modules/pro-animation/src/shutter-sampling.ts';
const c:FrameContext={frame:12,globalFrame:24,time:.5,globalTime:1,dt:1/48,fps:{num:24,den:1},durationInFrames:49,progress:.5,seed:37};
const rows=(p:Iterable<{time:number;weight:number}>)=>Array.from(p,s=>[s.time,s.weight]);
test('source retiming preserves the output clock, seed and immutable input',()=>{
 const before=structuredClone(c),s=sourceTimeContext(c,-.25);assert.equal(s.frame,-6);assert.equal(s.time,-.25);assert.equal(s.globalFrame,24);assert.equal(s.globalTime,1);assert.equal(s.progress,.5);assert.equal(s.seed,37);assert.ok(Object.isFrozen(s));assert.deepEqual(c,before);
});
test('affine shutter samples map global subframes using actual Stage rate',()=>{
 const s=shutterTimeContext(c,.5625);assert.equal(s.frame,13.5);assert.equal(s.globalFrame,27);assert.equal(s.globalTime,1.125);assert.equal(s.progress,.5625);assert.equal(s.dt,1/48);
 assert.equal(shutterTimeContext({...c,dt:-1/48},.5625).globalFrame,21);
 assert.throws(()=>shutterTimeContext({...c,dt:0},.5625),{code:'E_PA_NATIVE_TIME'});
});
test('finite source boundary policies are explicit including negative cycles',()=>{
 assert.equal(resolveTimeRange(-1,{start:0,end:2,boundary:'clamp'}),0);
 assert.equal(resolveTimeRange(3,{start:0,end:2,boundary:'loop'}),1);
 assert.equal(resolveTimeRange(-.5,{start:0,end:2,boundary:'loop'}),1.5);
 assert.equal(resolveTimeRange(2.5,{start:0,end:2,boundary:'ping-pong'}),1.5);
 assert.equal(resolveTimeRange(-.5,{start:0,end:2,boundary:'ping-pong'}),.5);
 assert.equal(resolveTimeRange(3,{start:0,end:2,boundary:'transparent'}),null);
 assert.equal(resolveTimeRange(2,{start:0,end:2,boundary:'loop'}),2);
 assert.throws(()=>resolveTimeRange(3,{start:0,end:2}),{code:'E_PA_NATIVE_TIME'});
 assert.throws(()=>resolveTimeRange(1,{start:0,end:0,boundary:'loop'}));
});
test('linear frame plan, exact centres, nearest ties, hold and negative times',()=>{
 assert.deepEqual(rows(frameBlendSamples({time:.3125,fps:4},c)),[[.25,.75],[.5,.25]]);
 assert.deepEqual(rows(frameBlendSamples({time:.5,fps:4},c)),[[.5,1]]);
 assert.deepEqual(rows(frameBlendSamples({time:.375,fps:4,method:'nearest'},c)),[[.5,1]]);
 assert.deepEqual(rows(frameBlendSamples({time:-.0625,fps:4},c)),[[-.25,.25],[0,.75]]);
 assert.deepEqual(rows(frameBlendSamples({time:-.0625,fps:4,method:'hold'},c)),[[-.25,1]]);
});
test('frame plans use rational fps, origin and Core keyframes',()=>{
 const time=keyframes([{frame:0,value:0},{frame:24,value:1}]),p=frameBlendSamples({time,fps:{num:30000,den:1001},origin:.1},c);
 const a=Array.from(p);assert.equal(a.length,2);assert.ok(Math.abs(a.reduce((s,v)=>s+v.weight*v.time,0)-.5)<1e-15);assert.deepEqual(p.at(1),p.at(1));assert.throws(()=>p.at(2));
});
test('Echo N means N+1 samples, signed spacing and geometric decay',()=>{
 assert.deepEqual(rows(echoSamples({time:1,echoes:3,interval:-.125,intensity:.5,decay:.5},c)),[[1,.5],[.875,.25],[.75,.125],[.625,.0625]]);
 assert.deepEqual(rows(echoSamples({time:1,echoes:0},c)),[[1,1]]);
 assert.deepEqual(rows(echoSamples({echoes:2,interval:.125,decay:0},c)),[[.5,1],[.625,0],[.75,0]]);
});
test('Echo plan is lazy with no effect-level 255-frame or path cap',()=>{
 const p=echoSamples({echoes:100000,decay:1,interval:.125},c);assert.equal(p.count,100001);assert.equal(p.at(100000).time,12500.5);assert.equal(p.at(100000).weight,1);
});
test('trails include finite endpoints and support distinct falloff rules',()=>{
 assert.deepEqual(rows(trailSamples({duration:.5,count:3,falloff:'linear'},c)),[[.5,1],[.25,.5],[0,0]]);
 assert.deepEqual(rows(trailSamples({duration:.5,count:3,direction:'future',falloff:'exponential',decay:.25},c)),[[.5,1],[.75,.5],[1,.25]]);
 assert.deepEqual(rows(trailSamples({duration:0,count:1,falloff:'box'},c)),[[.5,1]]);
});
test('wide temporal window uses midpoint quadrature without endpoint clamping',()=>{
 assert.deepEqual(rows(wideTimeSamples({before:1,after:1,count:4},c)),[[-.25,1],[.25,1],[.75,1],[1.25,1]]);
 assert.deepEqual(rows(wideTimeSamples({before:1,after:1,count:4,weight:'triangle'},c)),[[-.25,.25],[.25,.75],[.75,.75],[1.25,.25]]);
});
test('shutter plan reuses existing exact sample locations and maps actual global time',()=>{
 const o={count:16,angleDegrees:720,phaseDegrees:-360};const a=shutterTimeSamples(o,c),b=shutterSamples(o,c);
 assert.deepEqual(rows(a),rows(b));for(const sample of a){assert.equal(sample.context.globalFrame,c.globalFrame+(sample.time-c.time)/c.dt);assert.equal(sample.context.time,sample.time);}
});
test('finite hold supports resume and delay without hidden state',()=>{
 const o={start:1,end:3,hold:.25};assert.deepEqual([0,1,2,3,4].map(t=>freezeTimeRange(t,o)),[0,.25,.25,1,2]);
 assert.equal(freezeTimeRange(3,{...o,after:'resume'}),3);assert.equal(freezeTimeRange(2,{start:1,end:3}),1);
});
test('range reversal is an involution including both endpoints',()=>{
 const o={start:-1,end:2};for(const t of [-2,-1,-.75,0,1,2,3])assert.equal(reverseTimeRange(reverseTimeRange(t,o),o),t);
 assert.equal(reverseTimeRange(-1,o),2);assert.equal(reverseTimeRange(2,o),-1);
});
test('time jitter is stateless, seed-controlled and amplitude-bounded',()=>{
 const o={frequency:4,amplitude:.125,seed:37};const order=[1,-2,.125,0,1,.125];const values=order.map(t=>jitterTime(t,o));assert.equal(values[0],values[4]);assert.equal(values[2],values[5]);
 order.forEach((t,i)=>assert.ok(Math.abs(values[i]-t)<=.125));assert.notEqual(jitterTime(.125,o),jitterTime(.125,{...o,seed:38}));
 assert.equal(jitterTime(.125,{...o,interpolation:'hold'})-.125,jitterTime(0,{...o,interpolation:'hold'}));
});
test('strobe follows on intervals, transparent or held off intervals and negative cycles',()=>{
 const o={period:1,onDuration:.25};assert.equal(strobeTime(0,o),0);assert.equal(strobeTime(.25,o),null);assert.equal(strobeTime(1,o),1);assert.equal(strobeTime(-.9,o),-.9);
 assert.equal(strobeTime(.75,{...o,off:'hold'}),.25);assert.equal(strobeTime(-.5,{...o,off:'hold'}),-.75);
 assert.equal(strobeTime(0,{period:1,onDuration:0}),null);assert.equal(strobeTime(.9,{period:1,onDuration:1}),.9);
});
test('invalid parameters, unsafe time resolution and unsupported options fail',()=>{
 const invalid=[()=>sourceTimeContext(c,NaN),()=>resolveTimeRange(0,{start:2,end:1}),()=>frameBlendSamples({fps:0},c),()=>frameBlendSamples({time:1e30},c),()=>echoSamples({echoes:-1},c),()=>echoSamples({decay:2},c),()=>echoSamples({intensity:-1},c),()=>echoSamples({echoes:Number.MAX_SAFE_INTEGER},c),()=>echoSamples({echoes:10000,decay:.1},c).at(10000),()=>trailSamples({duration:-1},c),()=>wideTimeSamples({before:-1,after:0},c),()=>freezeTimeRange(0,{start:1,end:0}),()=>reverseTimeRange(0,{start:1,end:0}),()=>jitterTime(0,{frequency:0,amplitude:1}),()=>strobeTime(0,{period:0,onDuration:0}),()=>strobeTime(0,{period:1,onDuration:2}),()=>echoSamples({extra:true} as never,c)];for(const action of invalid)assert.throws(action);
});
