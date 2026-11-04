import {test} from 'node:test';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import * as graphics from '../modules/graphics-contracts/index.ts';
import {createCurveSampler} from '../modules/pro-animation/src/curve-sampler.ts';
import {createPathTools} from '../modules/pro-animation/src/path-tools.ts';
import type {PathCommand,PathData} from '../modules/graphics-contracts/types.ts';
import {directCurveFactory,curvePath} from './helpers/pa3-curve.ts';
import {cubicPoint,lerpPoint,type Cubic} from '../modules/pro-animation/src/geometry.ts';

const make=(p:PathData,options={})=>createCurveSampler(graphics,directCurveFactory,p,options),close=(a:number,b:number,e=1e-12)=>assert.ok(Math.abs(a-b)<=e,`${a} vs ${b} within ${e}`);

test('real kurbo prepared line metric preserves ordered/duplicate queries, exact endpoints and original-input isolation',async()=>{
 const p=curvePath([['M',10,20],['L',110,20]]),sampler=await make(p);p.commands[1]={op:'L',point:{id:'changed',x:999,y:0}};
 try{assert.equal(sampler.metrics.contours[0].length,100);const batch=await sampler.sampleBatch([100,0,50,0]);assert.deepEqual(batch.map(s=>[s.x,s.y]),[[110,20],[10,20],[60,20],[10,20]]);assert.deepEqual(batch[1],batch[3]);assert.ok(batch.every(s=>s.angleRadians===0&&s.tangentStatus==='derivative'));assert.deepEqual(await sampler.sample(50),batch[2]);assert.deepEqual(await sampler.sampleBatch([]),[]);
 }finally{assert.deepEqual(await sampler.dispose(),{mode:'cooperative',remainingSessions:0});assert.equal((await sampler.diagnostics()).closed,true);assert.equal('kernel' in await sampler.diagnostics(),false);await assert.rejects(sampler.sample(1),{code:'E_PA_CURVE_CLOSED'});}
});

// Independent test-only composite Simpson integration of analytic speed. No curve solver from kurbo is reused.
function referenceIntegral(c:Cubic,to:number,steps=8192){
 const speed=(t:number)=>{const u=1-t;return Math.hypot(3*u*u*(c[1][0]-c[0][0])+6*u*t*(c[2][0]-c[1][0])+3*t*t*(c[3][0]-c[2][0]),3*u*u*(c[1][1]-c[0][1])+6*u*t*(c[2][1]-c[1][1])+3*t*t*(c[3][1]-c[2][1]));};
 const h=to/steps;let sum=speed(0)+speed(to);for(let i=1;i<steps;i++)sum+=(i%2?4:2)*speed(i*h);return sum*h/3;
}
test('quadratic/cubic metric and inverse match independent converged Simpson speed integration',async()=>{
 const records:any[]=[];
 for(const input of [curvePath([['M',20,30],['Q',80,150,140,30]]),curvePath([['M',20,30],['C',30,130,130,130,140,30]])]){
  const first=input.commands[0],command=input.commands[1];assert.ok(first.op==='M');const a:[number,number]=[first.point.x,first.point.y];assert.ok(command.op==='Q'||command.op==='C');const b:[number,number]=[command.point.x,command.point.y];
  const c:Cubic=command.op==='Q'?[a,lerpPoint(a,[command.control.x,command.control.y],2/3),lerpPoint(b,[command.control.x,command.control.y],2/3),b]:[a,[command.control1.x,command.control1.y],[command.control2.x,command.control2.y],b];
  const sampler=await make(input,{accuracy:1e-6});try{const referenceLength=referenceIntegral(c,1),refined=referenceIntegral(c,1,16384),convergence=Math.abs(referenceLength-refined);assert.ok(convergence<=1e-9);const length=sampler.metrics.contours[0].length,error=Math.abs(length-referenceLength);assert.ok(error<=3e-6);let pointError=0;
   for(const fraction of [.1,.5,.9]){let lo=0,hi=1;for(let i=0;i<50;i++){const mid=(lo+hi)/2;if(referenceIntegral(c,mid)<fraction*referenceLength)lo=mid;else hi=mid;}const p=cubicPoint(c,(lo+hi)/2),actual=await sampler.sample(fraction*length);pointError=Math.max(pointError,Math.hypot(actual.x-p[0],actual.y-p[1]));assert.equal(actual.tangentStatus,'derivative');}assert.ok(pointError<=5e-6,`${pointError}`);records.push({kind:command.op,length,referenceLength,convergence8192vs16384:convergence,maxLengthError:error,maxPointError:pointError,lengthBudget:3e-6,pointBudget:5e-6});
  }finally{await sampler.dispose();}
 }await writeFile('.frameweave/pa3-curve/metric-reference.json',JSON.stringify(records,null,2));
});

test('join side is explicit; zero endpoint derivative has one-sided tangent while stationary cusp has no invented orientation',async()=>{
 const corner=await make(curvePath([['M',0,0],['L',10,0],['L',10,10]]));try{assert.equal((await corner.sample(10,{side:'incoming'})).angleRadians,0);close((await corner.sample(10,{side:'outgoing'})).angleRadians!,Math.PI/2);}finally{await corner.dispose();}
 const endpoint=await make(curvePath([['M',0,0],['C',0,0,0,10,10,10]]));try{const a=await endpoint.sample(0);assert.equal(a.tangentStatus,'endpoint-limit');close(a.angleRadians!,Math.PI/2);assert.equal((await endpoint.sample(endpoint.metrics.contours[0].length)).angleRadians,0);}finally{await endpoint.dispose();}
 const cusp=await make(curvePath([['M',0,0],['Q',100,0,0,0]]));try{const a=await cusp.sample(50);close(a.x,50,1e-6);assert.equal(a.tangentStatus,'undefined');assert.equal(a.angleRadians,undefined);}finally{await cusp.dispose();}
});

test('closed wrapping, clamping, multi-contour choice and zero-length diagnostics are explicit',async()=>{
 const sampler=await make(curvePath([['M',0,0],['L',10,0],['L',10,10],['L',0,10],['Z'],['M',30,0],['L',40,0],['M',0,0]]));
 try{await assert.rejects(sampler.sample(0),{code:'E_PA_CURVE_CONTOUR'});assert.equal(sampler.metrics.contours.length,3);assert.deepEqual(await sampler.sample(-5,{contour:0,boundary:'wrap'}),await sampler.sample(35,{contour:0}));assert.deepEqual(await sampler.sample(40,{contour:0,boundary:'wrap'}),await sampler.sample(0,{contour:0}));assert.equal((await sampler.sample(-10,{contour:1,boundary:'clamp'})).x,30);
  await assert.rejects(sampler.sample(-1,{contour:0}),{code:'E_PA_CURVE_RANGE'});await assert.rejects(sampler.sample(0,{contour:1,boundary:'wrap'}),{code:'E_PA_CURVE_CLOSURE'});await assert.rejects(sampler.sample(0,{contour:2}),{code:'E_PA_CURVE_DEGENERATE'});
 }finally{await sampler.dispose();}
});

test('1200 segments and 65 contours respect canonical safety policy without the prior module quantity caps',async()=>{
 const input=curvePath(Array.from({length:1201},(_,i)=>[i?'L':'M',i,0]));graphics.validatePathData(input);assert.throws(()=>createPathTools(graphics).measurePath(input),{code:'E_PA_LIMIT'});
 const a=await make(input);try{assert.equal(a.metrics.contours[0].segments,1200);assert.equal(a.metrics.contours[0].length,1200);close((await a.sample(1100)).x,1100);}finally{await a.dispose();}
 const multi=curvePath(Array.from({length:65},(_,i):([string,...number[]])[]=>[['M',i*10,0],['L',i*10+5,0]]).flat());const b=await make(multi);try{assert.equal(b.metrics.contours.length,65);close((await b.sample(2.5,{contour:64})).x,642.5);}finally{await b.dispose();}
});

test('stream early close, invalid input, pre-abort and active query cancellation leave explicit session states',async()=>{
 const sampler=await make(curvePath([['M',0,0],['L',10,0]]));try{
  const iterator=sampler.sampleStream([0,5,10]);assert.equal((await iterator.next()).done,false);await assert.rejects(sampler.sample(1),{code:'E_PA_CURVE_BUSY'});await iterator.return(undefined);assert.equal((await sampler.sample(2)).x,2);
  await assert.rejects(sampler.sampleBatch([NaN]),{code:'E_PA_CURVE_PARAMETER'});await assert.rejects(sampler.sample(0,{side:'other'} as any),{code:'E_PA_CURVE_PARAMETER'});
  const pre=new AbortController();pre.abort();await assert.rejects(sampler.sample(0,{signal:pre.signal}),{code:'E_PA_CURVE_CANCELLED'});assert.equal((await sampler.sample(2)).x,2);
  const abort=new AbortController(),pending=sampler.sampleBatch(Array.from({length:3000},(_,i)=>i/300),{signal:abort.signal});abort.abort();await assert.rejects(pending,{code:'E_PA_CURVE_CANCELLED'});assert.equal((await sampler.diagnostics()).closed,true);
 }finally{assert.deepEqual(await sampler.dispose(),{mode:'terminated'});}
});

test('real raw input/range/precision errors are rejected, reset and disposal work without ghost results',async()=>{
 const raw=await directCurveFactory({signal:new AbortController().signal});try{await assert.rejects(raw.append(new Float64Array([1,0,0])),/E_PA_CURVE_STATE/);await raw.begin();await assert.rejects(raw.append(new Float64Array([1,0])),/E_PA_CURVE_INPUT/);await raw.append(new Float64Array([1,0,0,2,10,0]));await assert.rejects(raw.prepare(1e-30),/E_PA_CURVE_ACCURACY/);await raw.begin();await raw.append(new Float64Array([1,0,0,2,10,0]));assert.equal(await raw.prepare(1e-6),1);const ready=await raw.sample(0,new Float64Array([5]),1);await assert.rejects(raw.prepare(1e-6),/E_PA_CURVE_STATE/);assert.deepEqual(await raw.sample(0,new Float64Array([5]),1),ready);await assert.rejects(raw.append(new Float64Array([2,20,0])),/E_PA_CURVE_STATE/);await assert.rejects(raw.sample(0,new Float64Array([11]),1),/E_PA_CURVE_RANGE/);await assert.rejects(raw.contour_info(999),/E_PA_CURVE_RANGE/);
 }finally{assert.deepEqual(await raw.dispose(),{remainingSessions:0});}
});
