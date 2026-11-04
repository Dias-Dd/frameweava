import {test} from 'node:test';
import assert from 'node:assert/strict';
import {keyframes,expr} from '../src/core/animation.ts';
import type {FrameContext} from '../src/core/types.ts';
import {shutterSamples} from '../modules/pro-animation/src/shutter-sampling.ts';
import {sampleSignalAtTime,remapTime} from '../modules/pro-animation/src/time-controls.ts';
import {referenceTemporalMean} from '../modules/pro-animation/validation/temporal-mean-reference.ts';
import fixtures from '../modules/pro-animation/validation/temporal-mean-reference.json';
const context=(frame=24):FrameContext=>({frame,time:frame/24,globalFrame:100,globalTime:100/24,dt:1/24,fps:{num:24,den:1},durationInFrames:240,progress:.25,seed:9});
const close=(a:number,b:number,limit=1e-12)=>assert.ok(Math.abs(a-b)<=limit,`${a} vs ${b}, tolerance ${limit}`);

test('default midpoint box shutter uses local fractional frames; arbitrary/repeat indices are exact',()=>{
 const plan=shutterSamples({},context());assert.equal(plan.count,16);close(plan.startTime,1-1/96);close(plan.endTime,1+1/96);
 const ordered=[...plan];close(ordered.reduce((s,p)=>s+p.weight,0),1);close(ordered.reduce((s,p)=>s+p.time*p.weight,0),1);
 for(const i of [15,0,7,4,15,1,7])assert.deepEqual(plan.at(i),ordered[i]);assert.ok(Object.isFrozen(plan));assert.ok(Object.isFrozen(plan.at(0)));
 for(let i=0;i<16;i++){close(plan.at(i).frame,23.75+(i+.5)*.5/16);assert.ok(plan.at(i).time>plan.startTime&&plan.at(i).time<plan.endTime);}
});
test('rational FPS, negative local time, wide shutter and explicit phase are not clamped',()=>{
 const c={...context(),fps:{num:30000,den:1001},time:-.25};
 const p=shutterSamples({count:3,angleDegrees:720,phaseDegrees:180},c),period=1001/30000;
 close(p.startTime,-.25+.5*period);close(p.endTime,-.25+2.5*period);
 for(let i=0;i<3;i++)close(p.at(i).time,-.25+(.5+(i+.5)*2/3)*period);
 assert.ok(p.at(2).time<0);
 const zero=shutterSamples({count:3,angleDegrees:0,phaseDegrees:360},c);for(const s of zero)close(s.time,-.25+period);
 for(const s of shutterSamples({count:3,angleDegrees:0},c))assert.equal(s.time,c.time);
});
test('Core Signals snapshot once; pure Signal subframe sampling preserves global context',()=>{
 const c=context(),before=structuredClone(c),angle=keyframes<number>([{frame:0,value:0},{frame:24,value:360}]);
 const p=shutterSamples({count:4,angleDegrees:angle,phaseDegrees:0,time:expr.time},c),snapshot=[...p];
 assert.deepEqual(c,before);
 angle.$keyframes[1].value=720;c.time=99;c.fps.num=12;assert.deepEqual([...p],snapshot);
 const actual=context(),original=structuredClone(actual),track=keyframes([{frame:0,value:0},{frame:48,value:96}]);
 const q=shutterSamples({count:8},actual);close([...q].reduce((sum,s)=>sum+sampleSignalAtTime(track,s.time,actual)*s.weight,0),48);
 assert.deepEqual(actual,original);for(const s of q)close(remapTime({time:s.time,mode:'loop',duration:1},actual),s.time%1);
});
test('midpoint quadrature has the independent box moments and improves its quadratic error by four',()=>{
 const c={...context(),time:0,fps:{num:1,den:1}};
 const moment=(n:number,power:number)=>[...shutterSamples({count:n,angleDegrees:720,phaseDegrees:-360},c)].reduce((s,p)=>s+p.time**power*p.weight,0);
 for(const n of [1,2,3,10,64,256]){close(moment(n,1),0);close(moment(n,2),(1-1/(n*n))/3);close(moment(n,3),0);}
 close((1/3-moment(16,2))/(1/3-moment(32,2)),4,1e-10);
});
test('lazy plans have no arbitrary count cap and diagnose F64 spacing and invalid domains',()=>{
 const large=shutterSamples({count:1_000_001},context());assert.equal(large.count,1_000_001);assert.equal(large.at(999_999).index,999_999);
 for(const options of [{count:0},{count:1.5},{count:Infinity},{count:Number.MAX_SAFE_INTEGER+1},{angleDegrees:-1},{angleDegrees:NaN},{phaseDegrees:Infinity},{time:Infinity},{time:1e30},{time:1e16,angleDegrees:1e-9},{time:0,angleDegrees:Number.MIN_VALUE},{count:Number.MAX_SAFE_INTEGER}])assert.throws(()=>shutterSamples(options,context()),{code:'E_PA_TIME'});
 const p=shutterSamples({count:3},context());for(const i of [-1,3,1.5,NaN,Infinity])assert.throws(()=>p.at(i),{code:'E_PA_TIME'});
 assert.throws(()=>shutterSamples({}, {...context(),fps:{num:0,den:1}}),{code:'E_TIME'});
});
test('test-only temporal mean preserves native PM emission but discards straight hidden zero-alpha RGB',()=>{
 const result=referenceTemporalMean([{pixel:[-4,12,2,.25],weight:1,alpha:'straight'},{pixel:[2,-2,8,.75],weight:3,alpha:'premultiplied'}]);
 assert.deepEqual(result,[1.25,-.75,6.125,.625]);
 assert.deepEqual(referenceTemporalMean([{pixel:[65000,-65000,1,0],weight:1,alpha:'straight'},{pixel:[2,4,8,1],weight:1,alpha:'opaque'}]),[1,2,4,.5]);
 assert.deepEqual(referenceTemporalMean([{pixel:[2,-4,6,0],weight:1,alpha:'premultiplied'},{pixel:[4,8,2,1],weight:1,alpha:'opaque'}]),[3,2,4,.5]);
 assert.deepEqual(referenceTemporalMean([{pixel:[-1,2,4,1],weight:1e308,alpha:'straight'},{pixel:[3,4,8,1],weight:1e308,alpha:'straight'}]),[1,3,6,1]);
 assert.deepEqual(referenceTemporalMean([{pixel:[1e20,-1e20,8,1],weight:1,alpha:'premultiplied'},{pixel:[1,3,4,1],weight:1,alpha:'premultiplied'},{pixel:[-1e20,1e20,0,1],weight:1,alpha:'premultiplied'}]),[1/3,1,4,1]);
 for(const samples of [[],[{pixel:[0,0,0,1],weight:0,alpha:'straight'}],[{pixel:[0,0,0,1],weight:-1,alpha:'straight'}],[{pixel:[0,0,0,2],weight:1,alpha:'straight'}],[{pixel:[0,0,0,0],weight:1,alpha:'opaque'}]])assert.throws(()=>referenceTemporalMean(samples as any));
});
test('Binary64 test oracle agrees with fourteen independently generated exact-rational fixtures',()=>{
 assert.equal(fixtures.cases.length,14);
 for(const fixture of fixtures.cases){
  const actual=referenceTemporalMean(fixture.samples as any);
  for(let c=0;c<4;c++)close(actual[c],fixture.roundedBinary64[c],1e-12*Math.max(1,Math.abs(fixture.roundedBinary64[c])));
  if(fixture.id==='rgb-cancellation')assert.equal(actual[0],1/3,'Do not hide a lost small residual behind the HDR energy budget');
 }
});
