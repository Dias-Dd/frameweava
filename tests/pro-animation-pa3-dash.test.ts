import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as graphics from '../modules/graphics-contracts/index.ts';
import {createPathDasher} from '../modules/pro-animation/src/path-dashes.ts';
import {createPathTools} from '../modules/pro-animation/src/path-tools.ts';
import {keyframes} from '../src/core/animation.ts';
import type {PathCommand,PathData} from '../modules/graphics-contracts/types.ts';
import {directDashFactory} from './helpers/pa3-dash.ts';
const ctx=(frame:number)=>({frame,time:frame/12,fps:12,globalTime:frame/12} as any);
function path(rows:([string,...number[]])[]):PathData{let n=0;const p=(x:number,y:number)=>({id:'p.'+n++,x,y});return {schema:'frameweave.path',version:1,id:'test',coordinates:{spaceId:'canvas',unit:'px',origin:'top-left',x:'right',y:'down',width:384,height:192},fillRule:'nonzero',commands:rows.map(([op,...v]):PathCommand=>op==='Z'?{op:'Z'}:op==='Q'?{op:'Q',control:p(v[0],v[1]),point:p(v[2],v[3])}:op==='C'?{op:'C',control1:p(v[0],v[1]),control2:p(v[2],v[3]),point:p(v[4],v[5])}:{op:op as 'M'|'L',point:p(v[0],v[1])})};}
const line=path([['M',0,20],['L',100,20]]),rectangle=path([['M',0,0],['L',10,0],['L',10,10],['L',0,10],['Z']]);
const make=()=>createPathDasher(graphics,directDashFactory),measure=createPathTools(graphics);
const close=(a:number,b:number,e=1e-4)=>assert.ok(Math.abs(a-b)<=e,`${a} vs ${b} within ${e}`);
// Analytical lengths use the already-declared kurbo 1e-6 arclength contract, not bit-identical decimal arithmetic.
const intervals=(paths:PathData[])=>paths.map(p=>p.commands.filter(c=>c.op!=='Z').map(c=>(c as Exclude<PathCommand,{op:'Z'}>).point.x)).map(xs=>[Math.min(...xs),Math.max(...xs)]).sort((a,b)=>a[0]-b[0]);

const sameIntervals=(actual:number[][],expected:number[][])=>{assert.equal(actual.length,expected.length);for(let i=0;i<actual.length;i++)for(let j=0;j<2;j++)close(actual[i][j],expected[i][j],1e-6);};

test('kurbo real WASM has analytical line dash intervals, signed phase and odd-array doubling',async()=>{
 const api=await make();try{
  sameIntervals(intervals(await api.dashPaths([line],{pattern:[10,5]})),[[0,10],[15,25],[30,40],[45,55],[60,70],[75,85],[90,100]]);
  const short=path([['M',0,20],['L',30,20]]);
  sameIntervals(intervals(await api.dashPaths([short],{pattern:[10,5],offset:3})),[[0,7],[12,22],[27,30]]);
  assert.deepEqual(await api.dashPaths([line],{pattern:[5],offset:-8}),await api.dashPaths([line],{pattern:[5,5],offset:12}));
  assert.deepEqual(await api.dashPaths([line],{pattern:[]}),[line]);
 }finally{assert.deepEqual(await api.dispose(),{mode:'cooperative',remainingSessions:0});}
});

test('closed seam is joined as one continuous dash; solid closed loop preserves Z, separate contours restart phase',async()=>{
 const api=await make();try{
  const seam=await api.dashPaths([rectangle],{pattern:[15,10]});assert.equal(seam.length,1);close(measure.measurePath(seam[0],{tolerance:1e-5}).length,30);assert.equal(seam[0].commands.some(c=>c.op==='Z'),false);
  const solid=await api.dashPaths([rectangle],{pattern:[100,1]});assert.equal(solid.length,1);assert.equal(solid[0].commands.at(-1)?.op,'Z');close(measure.measurePath(solid[0]).length,40);
  const multi=path([['M',0,0],['L',30,0],['M',0,10],['L',30,10]]),parts=await api.dashPaths([multi],{pattern:[10,5],offset:3});assert.equal(parts.length,6);
  sameIntervals(intervals(parts.filter(p=>p.commands[0].op==='M'&&p.commands[0].point.y===0)),[[0,7],[12,22],[27,30]]);
  sameIntervals(intervals(parts.filter(p=>p.commands[0].op==='M'&&p.commands[0].point.y===10)),[[0,7],[12,22],[27,30]]);
 }finally{await api.dispose();}
});

test('quadratic/cubic dash output retains original curves and matches independent De Casteljau arc-length',async()=>{
 const api=await make();try{for(const curve of [path([['M',0,10],['Q',60,100,120,10]]),path([['M',0,10],['C',10,100,110,100,120,10]])]){
  const parts=await api.dashPaths([curve],{pattern:[20,11]});assert.ok(parts.length>3);assert.ok(parts.some(p=>p.commands.some(c=>c.op==='Q'||c.op==='C')));
  const total=measure.measurePath(curve,{tolerance:1e-5}).length,expected=Math.floor(total/31)*20+Math.min(20,total%31),actual=parts.reduce((sum,p)=>sum+measure.measurePath(p,{tolerance:1e-5}).length,0);close(actual,expected,2e-4);
  for(const p of parts)graphics.validatePathData(p);
 }}finally{await api.dispose();}
});

test('dash offset and lengths use existing Signals, random/repeated frames are identical',async()=>{
 const api=await make(),offset=keyframes([{frame:0,value:-10},{frame:12,value:30,easing:'easeInOut'}]),on=keyframes([{frame:0,value:3},{frame:12,value:9}]),seen=new Map<number,PathData[]>();
 try{for(const frame of [6,0,12,3,6,12,0]){const result=await api.dashPaths([line],{pattern:[on,4],offset},ctx(frame));if(seen.has(frame))assert.deepEqual(result,seen.get(frame));seen.set(frame,result);}
  await assert.rejects(api.dashPaths([line],{pattern:[on,4]}),{code:'E_PA_DASH_CONTEXT'});
 }finally{await api.dispose();}
});

test('invalid patterns/precision/budgets fail explicitly, results reset and session stays reusable',async()=>{
 const api=await make();try{
  for(const pattern of [[0,5],[-1,5],[NaN,1],[Number.MAX_VALUE,Number.MAX_VALUE]])await assert.rejects(api.dashPaths([line],{pattern}),{code:'E_PA_DASH_PARAMETER'});
  await assert.rejects(api.dashPaths([line],{pattern:[1e-16,1e-16]}),/E_PA_DASH_ACCURACY/);
  await assert.rejects(api.dashPaths([line],{pattern:[1,1],maxOutputCommands:5}),/E_PA_DASH_BUDGET/);
  await assert.rejects(api.dashPaths([line],{pattern:[5],offset:Infinity}),{code:'E_PA_DASH_PARAMETER'});
  await assert.rejects(api.dashPaths([line],{pattern:[5],maxOutputCommands:0}),{code:'E_PA_DASH_PARAMETER'});
  assert.equal((await api.dashPaths([line],{pattern:[10,5]})).length,7);
 }finally{await api.dispose();}
 await assert.rejects(api.dashPaths([line],{pattern:[5]}),{code:'E_PA_DASH_CLOSED'});
});

test('lazy contour result gate, early close, and AbortSignal never publish fake success',async()=>{
 const api=await make();try{
  const iterator=api.dashPathsStream([line],{pattern:[10,5]});assert.equal((await iterator.next()).done,false);
  await assert.rejects(api.dashPaths([line],{pattern:[5]}),{code:'E_PA_DASH_BUSY'});await iterator.return(undefined);
  assert.equal((await api.dashPaths([line],{pattern:[10,5]})).length,7);
  const abort=new AbortController(),next=api.dashPaths([line],{pattern:[1,1],signal:abort.signal});abort.abort();await assert.rejects(next);assert.equal((await api.diagnostics()).closed,true);
 }finally{assert.equal((await api.dispose()).mode,'terminated');}
});

test('real raw data protocol rejects malformed/range inputs and survives reset without leaked sessions',async()=>{
 const kernel=await directDashFactory({signal:new AbortController().signal});try{
  await assert.rejects(kernel.append(new Float64Array([1,0,0])),/E_PA_DASH_STATE/);await kernel.begin();
  await assert.rejects(kernel.append(new Float64Array([2,1,1])),/E_PA_DASH_INPUT/);
  await assert.rejects(kernel.append(new Float64Array([1,0,0,4,1])),/E_PA_DASH_INPUT/);
  await kernel.append(new Float64Array([1,0,0,2,32,0]));
  await assert.rejects(kernel.dash(new Float64Array([0,1]),0,0),/E_PA_DASH_PARAMETER/);
  assert.equal(await kernel.dash(new Float64Array([8,8]),0,0),2);
  await assert.rejects(kernel.read_contour(0,0,999),/E_PA_DASH_RANGE/);await assert.rejects(kernel.contour_size(999),/E_PA_DASH_RANGE/);
  await kernel.reset();assert.equal((await kernel.diagnostics() as any).liveSessions,1);
 }finally{assert.deepEqual(await kernel.dispose(),{remainingSessions:0});}
});

test('one canonical input can yield more than 1024 contours without a new permanent quantity cap',async()=>{
 const api=await make();try{
  const input=path([['M',0,0],['L',3000,0]]);let count=0,total=0;
  for await(const piece of api.dashPathsStream([input],{pattern:[1,1]})){count++;total+=measure.measurePath(piece).length;}
  assert.equal(count,1500);close(total,1500,1e-6);assert.equal((await api.diagnostics()).busy,false);
 }finally{await api.dispose();}
});
