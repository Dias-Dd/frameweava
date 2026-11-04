import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as graphics from '../modules/graphics-contracts/index.ts';
import {createShapeModifiers} from '../modules/pro-animation/src/shape-modifiers.ts';
import {createPathTools} from '../modules/pro-animation/src/path-tools.ts';
import {keyframes} from '../src/core/animation.ts';
import type {PathData,PathPoint,PathCommand} from '../modules/graphics-contracts/types.ts';
import type {FrameContext} from '../src/core/types.ts';

const shape=createShapeModifiers(graphics),tools=createPathTools(graphics);
const ctx=(frame=0):FrameContext=>({frame,globalFrame:frame,time:frame/12,globalTime:frame/12,fps:{num:12,den:1},dt:1/12,seed:7,progress:frame/8,durationInFrames:9});
const point=(id:string,x:number,y:number):PathPoint=>({id,x,y});
const path=(commands:PathCommand[]):PathData=>({schema:'frameweave.path',version:1,id:'fixture',coordinates:{spaceId:'canvas',unit:'px',origin:'top-left',x:'right',y:'down',width:320,height:192},fillRule:'nonzero',commands});
const square=path([{op:'M',point:point('a',0,0)},{op:'L',point:point('b',100,0)},{op:'L',point:point('c',100,100)},{op:'L',point:point('d',0,100)},{op:'Z'}]);
const all=(p:PathData)=>p.commands.flatMap(c=>c.op==='Z'?[]:c.op==='C'?[c.control1,c.control2,c.point]:c.op==='Q'?[c.control,c.point]:[c.point]);
const close=(a:number,b:number,tolerance=1e-10)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} vs ${b} (tolerance ${tolerance})`);

test('Repeater is lazy, affine, fractional, ordered and captures inputs without a permanent copy-count cap',()=>{
 const input=path([{op:'M',point:point('m',3,5)},{op:'Q',control:point('h',5,9),point:point('e',7,5)}]),original=structuredClone(input);
 const options={copies:2.5,offset:.5,position:[10,20] as const,anchor:[2,3] as const,rotation:Math.PI/2,scale:[4,1] as const,startOpacity:.9,endOpacity:.3};
 const rows=[...shape.repeatPath(input,options,ctx())];assert.deepEqual(rows.map(r=>r.index),[0,1,2]);close(rows[0].opacity,.9);close(rows[1].opacity,.6);close(rows[2].opacity,.15);
 const c=rows[0].path.commands[0];assert.ok(c.op==='M');
 const theta=Math.PI/4,x=(3-2)*2,y=5-3;close(c.point.x,2+5+Math.cos(theta)*x-Math.sin(theta)*y);close(c.point.y,3+10+Math.sin(theta)*x+Math.cos(theta)*y);
 assert.equal(rows[0].path.commands[1].op,'Q');assert.deepEqual(input,original);
 assert.deepEqual([...shape.repeatPath(input,{...options,order:'reverse'},ctx())].map(r=>r.index),[2,1,0]);
 const billion=shape.repeatPath(input,{copies:1e9,position:[.001,0]},ctx());assert.equal(billion.next().value!.index,0);assert.equal(billion.next().value!.index,1);billion.return?.();
 const config={copies:2,position:[10,0] as [number,number]},captured=shape.repeatPath(input,config,ctx());input.commands[0]={op:'M',point:point('new',300,300)};config.position[0]=999;
 const frozen=[...captured];assert.deepEqual(frozen[0].path.commands[0],original.commands[0]);const second=frozen[1].path.commands[0];assert.ok(second.op==='M');close(second.point.x,13);
 assert.equal([...shape.repeatPath(original,{copies:0},ctx())].length,0);
});

test('Repeater Signals, cancellation, invalid transforms and caller budgets are explicit',()=>{
 const opts={copies:keyframes([{frame:0,value:1},{frame:8,value:5}]),position:[12,0] as const};
 assert.equal([...shape.repeatPath(square,opts,ctx(4))].length,3);
 const controller=new AbortController(),rows=shape.repeatPath(square,{copies:5,signal:controller.signal},ctx());rows.next();controller.abort();assert.throws(()=>rows.next(),{name:'AbortError'});
 assert.throws(()=>shape.repeatPath(square,{copies:-1},ctx()),{code:'E_PA_SHAPE_PARAMETER'});
 assert.throws(()=>[...shape.repeatPath(square,{copies:2,scale:[-1,1],offset:.5},ctx())],{code:'E_PA_SHAPE_TRANSFORM'});
 assert.throws(()=>[...shape.repeatPath(square,{copies:1,maxCommands:2},ctx())],{code:'E_PA_SHAPE_BUDGET'});
 assert.throws(()=>shape.repeatPath(square,{copies:1,startOpacity:2},ctx()),{code:'E_PA_SHAPE_PARAMETER'});
 assert.throws(()=>shape.repeatPath(square,{copies:1,position:[NaN,0]},ctx()),{code:'E_PA_SHAPE_PARAMETER'});
 const normalized={...square,coordinates:{...square.coordinates,unit:'normalized' as const}};assert.throws(()=>shape.repeatPath(normalized,{copies:1},ctx()),{code:'E_PA_SHAPE_SPACE'});
});

test('Pucker/Bloat retains upstream mean/handle semantics for L/Q/C, closures and holes without input mutation',()=>{
 const source=structuredClone(square),p=shape.puckerBloat(square,{amount:50},ctx());assert.deepEqual(square,source);assert.equal(p.commands.filter(c=>c.op==='C').length,4);
 const m=p.commands[0],c=p.commands[1];assert.ok(m.op==='M'&&c.op==='C');assert.deepEqual(m.point,point('a',25,25));close(c.control1.x,-25);close(c.control2.x,125);close(c.point.x,75);close(c.point.y,25);
 assert.deepEqual(shape.puckerBloat(square,{amount:0},ctx()),square);
 const q=path([{op:'M',point:point('pa.shape.0',0,0)},{op:'Q',control:point('pa.shape.1',30,60),point:point('q',60,0)},{op:'C',control1:point('c1',70,0),control2:point('c2',80,20),point:point('end',90,30)}]);
 const curved=shape.puckerBloat(q,{amount:-25},ctx());graphics.validatePathData(curved);assert.equal(curved.commands[1].op,'C');assert.equal(all(curved).length,new Set(all(curved).map(p=>p.id)).size);
 const hole=path([...square.commands,...square.commands.map(c=>c.op==='Z'?c:{op:c.op,point:{...c.point,id:c.point.id+'hole',x:c.point.x/3+33,y:c.point.y/3+33}}) as PathCommand[]]);
 assert.equal(shape.puckerBloat(hole,{amount:20},ctx()).commands.filter(c=>c.op==='Z').length,2);
 assert.throws(()=>shape.puckerBloat(square,{amount:Infinity},ctx()),{code:'E_PA_SHAPE_PARAMETER'});
});

test('Round Corners keeps open ends, four cubic fillets, winding and a circular-arc numeric reference',()=>{
 const rounded=shape.roundCorners(square,{radius:10,tolerance:1e-5},ctx());assert.equal(rounded.commands.filter(c=>c.op==='C').length,4);assert.equal(rounded.commands.at(-1)!.op,'Z');
 const k=4/3*Math.tan(Math.PI/8),firstArc=rounded.commands.find(c=>c.op==='C')!;assert.ok(firstArc.op==='C');
 close(firstArc.control1.x,90+10*k);close(firstArc.control1.y,0);close(firstArc.control2.x,100);close(firstArc.control2.y,10-10*k);close(firstArc.point.x,100);close(firstArc.point.y,10);
 const s=tools.createPathSampler(rounded,{tolerance:1e-4}),expectedLength=320+20*Math.PI;close(s.metrics.length,expectedLength,.02);
 let area=0;const ps=Array.from({length:256},(_,i)=>s.sample(i/256));for(let i=0;i<ps.length;i++){const a=ps[i],b=ps[(i+1)%ps.length];area+=a.x*b.y-b.x*a.y;}assert.ok(area>0);close(area/2,10000-(4-Math.PI)*100,1.5);
 const open=path(square.commands.slice(0,3)),r=shape.roundCorners(open,{radius:10},ctx());const start=r.commands[0],end=r.commands.at(-1)!;assert.ok(start.op==='M'&&end.op!=='Z');assert.deepEqual([start.point.x,start.point.y],[0,0]);assert.deepEqual([end.point.x,end.point.y],[100,100]);assert.equal(r.commands.filter(c=>c.op==='C').length,1);
 assert.deepEqual(shape.roundCorners(square,{radius:0},ctx()),square);
 const large=shape.roundCorners(square,{radius:1e6},ctx());graphics.validatePathData(large);assert.equal(large.commands.filter(c=>c.op==='C').length,4);
});

test('Round Corners preserves curved neighboring pieces, degenerate subpaths and diagnoses resource/parameter failures',()=>{
 const curved=path([{op:'M',point:point('a',0,0)},{op:'C',control1:point('b',25,0),control2:point('c',75,25),point:point('d',100,25)},{op:'L',point:point('e',100,100)},{op:'Q',control:point('f',40,100),point:point('g',0,70)}]);
 const before=structuredClone(curved),r=shape.roundCorners(curved,{radius:12,tolerance:1e-5},ctx());assert.deepEqual(curved,before);assert.ok(r.commands.some(c=>c.op==='Q'));assert.ok(r.commands.filter(c=>c.op==='C').length>=2);assert.ok(all(r).every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));graphics.validatePathData(r);
 const tiny=structuredClone(curved);for(const p of all(tiny)){p.x*=1e-12;p.y*=1e-12;}assert.ok(shape.roundCorners(tiny,{radius:12e-12,tolerance:1e-15},ctx()).commands.some(c=>c.op==='C'),'Accuracy floor must scale with actual coordinates, not impose a permanent pixel epsilon');
 const empty=path([{op:'M',point:point('a',4,6)},{op:'Z'}]);assert.equal(shape.roundCorners(empty,{radius:10},ctx()).commands.length,2);
 assert.throws(()=>shape.roundCorners(curved,{radius:10,maxSubdivisionSteps:1},ctx()),{code:'E_PA_SHAPE_BUDGET'});
 assert.throws(()=>shape.roundCorners(curved,{radius:10,tolerance:1e-100},ctx()),{code:'E_PA_SHAPE_ACCURACY'});
 assert.throws(()=>shape.roundCorners(square,{radius:-1},ctx()),{code:'E_PA_SHAPE_PARAMETER'});
 assert.throws(()=>shape.roundCorners(square,{radius:1,tolerance:0},ctx()),{code:'E_PA_SHAPE_PARAMETER'});
 assert.throws(()=>shape.roundCorners(square,{radius:10,maxCommands:2},ctx()),{code:'E_PA_SHAPE_BUDGET'});
});

test('New geometry functions do not add the old 1024-segment/64-contour caps; random/repeated frames are exact',()=>{
 const commands:PathCommand[]=[{op:'M',point:point('a',0,0)}];for(let i=1;i<=2048;i++)commands.push({op:'L',point:point('v'+i,i/10,0)});
 const long=path(commands);assert.equal(shape.puckerBloat(long,{amount:5},ctx()).commands.length,2049);assert.ok(shape.roundCorners(long,{radius:1},ctx()).commands.length>=2049);
 const many=path(Array.from({length:80},(_,i):PathCommand[]=>[{op:'M',point:point('m'+i,i,0)},{op:'L',point:point('l'+i,i,1)}]).flat());assert.equal(shape.roundCorners(many,{radius:1},ctx()).commands.filter(c=>c.op==='M').length,80);
 const seen=new Map<number,string>();for(const frame of [4,0,8,2,4,8,0]){const context=ctx(frame),p=shape.roundCorners(shape.puckerBloat(square,{amount:keyframes([{frame:0,value:-20},{frame:8,value:40}])},context),{radius:4+frame},context),json=JSON.stringify([...shape.repeatPath(p,{copies:2.5,rotation:frame/20},context)]);if(seen.has(frame))assert.equal(json,seen.get(frame));seen.set(frame,json);}
});
