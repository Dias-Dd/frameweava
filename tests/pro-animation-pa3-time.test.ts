import {test} from 'node:test';
import assert from 'node:assert/strict';
import {keyframes,evaluate,expr} from '../src/core/animation.ts';
import type {FrameContext,Easing} from '../src/core/types.ts';
import {remapTime,posterizeTime,sampleSignalAtTime,createSpeedRamp} from '../modules/pro-animation/src/time-controls.ts';
const ctx=(frame:number):FrameContext=>({frame,globalFrame:100,time:frame/10,globalTime:10,dt:.1,progress:.7,fps:{num:10,den:1},durationInFrames:20,seed:17});
const close=(a:number,b:number,e=1e-10)=>assert.ok(Math.abs(a-b)<=e,`${a} vs ${b} tolerance ${e}`);

test('nonlinear source time reuses existing Signal; explicit clamp/loop/ping-pong handle negative phase and endpoints',()=>{
 const curve=keyframes([{frame:0,value:2},{frame:10,value:4,easing:'easeIn'}]);close(remapTime({time:curve},ctx(5)),2.5);
 for(const [time,loop,ping]of [[-2,0,0],[-1,0,1],[-.25,.75,.25],[0,0,0],[.25,.25,.25],[1,0,1],[1.25,.25,.75],[2,0,0]] as const){close(remapTime({time,duration:1,mode:'loop'},ctx(0)),loop);close(remapTime({time,duration:1,mode:'ping-pong'},ctx(0)),ping);}
 close(remapTime({time:11,start:2,duration:3,mode:'loop'},ctx(0)),2);close(remapTime({time:-1,start:2,duration:3,mode:'clamp'},ctx(0)),2);close(remapTime({time:8,start:2,duration:3,mode:'clamp'},ctx(0)),5);
 for(const options of [{time:NaN},{time:1,duration:0,mode:'loop'},{time:1,mode:'clamp'},{time:1,mode:'bad'},{time:1,duration:2},{time:1e30,mode:'loop',duration:1},{time:1,start:1e30,duration:1,mode:'clamp'},{time:-Number.MIN_VALUE,mode:'loop',duration:1}])assert.throws(()=>remapTime(options as any,ctx(0)),{code:'E_PA_TIME'});
});

test('posterize uses rational sample-and-hold semantics including before origin; no fuzzy endpoint snapping',()=>{
 for(const [time,result]of [[0,0],[.249,0],[.25,.25],[.251,.25],[-.01,-.25],[-.25,-.25]] as const)close(posterizeTime({time,rate:4},ctx(0)),result);
 const q=posterizeTime({time:1,rate:{num:30000,den:1001},origin:.125},ctx(0));close(q,.125+Math.floor(.875*30000/1001)*1001/30000);
 close(posterizeTime({rate:2},ctx(7)),.5);assert.throws(()=>posterizeTime({rate:0},ctx(0)),{code:'E_TIME'});assert.throws(()=>posterizeTime({rate:1,time:1e30},ctx(0)),{code:'E_PA_TIME'});
});

test('local Signal sample preserves global time/progress/seed and the original FrameContext',()=>{
 const c=ctx(6),before=structuredClone(c),signal=keyframes([{frame:0,value:0},{frame:10,value:100,easing:'easeOut'}]);close(sampleSignalAtTime(signal,.5,c),75);
 close(sampleSignalAtTime(expr.add(expr.time,expr.globalTime,expr.progress),.25,c),10.95);assert.deepEqual(c,before);
 assert.throws(()=>sampleSignalAtTime(signal,Infinity,c),{code:'E_PA_TIME'});
});

test('speed ramp analytically integrates Core keyframes, including incoming easing, hold, reverse and constant endpoint speeds',()=>{
 for(const [easing,area]of [['linear',1],['step',0],['easeIn',2/3],['easeOut',4/3],['easeInOut',1]] as const){const track=keyframes([{frame:0,value:0},{frame:10,value:2,easing}]),ramp=createSpeedRamp(track);close(ramp.timeAt(ctx(10)),area);close(ramp.speedAt(ctx(3.5)),evaluate(track,ctx(3.5)));close(ramp.timeAt(ctx(20)),area+2);}
 const ramp=createSpeedRamp(keyframes([{frame:2,value:-2}]));close(ramp.timeAt(ctx(10)),-2);close(ramp.timeAt(ctx(-10)),2);
 const stop=createSpeedRamp(keyframes([{frame:0,value:0},{frame:10,value:0}]),{sourceTime:4});close(stop.timeAt(ctx(100)),4);
 const track=keyframes<number>([{frame:0,value:1},{frame:10,value:3,easing:{bezier:[.2,-.5,.8,1.5]}}]),frozen=createSpeedRamp(track),expected=frozen.timeAt(ctx(7));track.$keyframes[1].value=200;(track.$keyframes[1].easing as {bezier:number[]}).bezier[0]=1;close(frozen.timeAt(ctx(7)),expected,0);
});

test('Bezier speed integration agrees with independent Core-evaluation quadrature and velocity derivatives',()=>{
 const curves:Easing[]=[{bezier:[.42,0,.58,1]},{bezier:[0,0,0,1]},{bezier:[1,0,1,1]},{bezier:[.1,-.8,.8,1.8]},'easeInOut'];
 for(const easing of curves){
  const track=keyframes([{frame:0,value:-.4},{frame:10,value:2.6,easing}]),ramp=createSpeedRamp(track),n=10000;let area=0;
  for(let i=0;i<=n;i++)area+=evaluate(track,ctx(i*10/n))*(i===0||i===n?1:i%2?4:2);area/=3*n;
  close(ramp.timeAt(ctx(10)),area,3e-7); // Predeclared F64/endpoint-cusp quadrature budget; no pixel tolerance involved.
  for(const frame of [2,4,6,8]){const h=1e-4,derivative=(ramp.timeAt(ctx(frame+h))-ramp.timeAt(ctx(frame-h)))/(2*h/10);close(derivative,evaluate(track,ctx(frame)),3e-5);}
 }
});

test('speed ramp is stateless across fractional/repeated/random frames and validates invalid/overflowing tracks',()=>{
 const track=keyframes([{frame:3,value:1},{frame:7,value:-1,easing:'easeInOut'},{frame:10,value:0}]),ramp=createSpeedRamp(track,{originFrame:5,sourceTime:2}),seen=new Map<number,number>();
 for(const frame of [5,8.5,0,20,-5,8.5,0,5]){const time=ramp.timeAt(ctx(frame));if(seen.has(frame))assert.equal(time,seen.get(frame));seen.set(frame,time);}close(ramp.timeAt(ctx(5)),2);
 const shifted=createSpeedRamp(track,{originFrame:8.5,sourceTime:ramp.timeAt(ctx(8.5))});for(const frame of [-1,0,3,8,10,25])close(shifted.timeAt(ctx(frame)),ramp.timeAt(ctx(frame)));
 assert.throws(()=>createSpeedRamp({$keyframes:[]} as any),{code:'E_KEYFRAMES'});assert.throws(()=>createSpeedRamp({$keyframes:[{frame:0,value:'x'}]} as any),{code:'E_PA_TIME'});assert.throws(()=>createSpeedRamp(keyframes([{frame:0,value:1}]),{sourceTime:NaN}),{code:'E_PA_TIME'});
 assert.throws(()=>createSpeedRamp(keyframes([{frame:0,value:1e308},{frame:1e308,value:1e308}])) ,{code:'E_PA_TIME'});
 const many=createSpeedRamp(keyframes(Array.from({length:10000},(_,i)=>({frame:i,value:1}))));close(many.timeAt(ctx(9999)),999.9,1e-10);
});
