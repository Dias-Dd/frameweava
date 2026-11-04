import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import * as graphics from '../modules/graphics-contracts/index.ts';
import {createPathOperations} from '../modules/pro-animation/src/path-operations.ts';
import {keyframes} from '../src/core/animation.ts';
import type {PathData,PathCommand} from '../modules/graphics-contracts/types.ts';
import {operations,directFactory} from './helpers/pa3-pathops.ts';

const path=(commands:PathCommand[],fillRule:PathData['fillRule']='nonzero'):PathData=>({schema:'frameweave.path',version:1,id:'input',coordinates:{spaceId:'canvas',unit:'px',origin:'top-left',x:'right',y:'down',width:384,height:192},fillRule,commands});
function polygon(points:number[][],prefix='p'):PathCommand[]{return [...points.map(([x,y],i):PathCommand=>({op:i?'L':'M',point:{id:prefix+i,x,y}})),{op:'Z'}];}
const rect=(x:number,y:number,w:number,h:number,reverse=false)=>path(polygon((reverse?[[x,y],[x,y+h],[x+w,y+h],[x+w,y]]:[[x,y],[x+w,y],[x+w,y+h],[x,y+h]])));
function area(p:PathData):number{let out=0,points:number[][]=[];const flush=()=>{for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];out+=(a[0]*b[1]-b[0]*a[1])/2;}points=[];};for(const c of p.commands){if(c.op==='M')flush();if(c.op!=='Z')points.push([c.point.x,c.point.y]);else flush();}flush();return out;}
const sum=(paths:PathData[])=>paths.reduce((a,p)=>a+area(p),0);
const close=(a:number,b:number,e=1e-7)=>assert.ok(Math.abs(a-b)<=e,`${a} vs ${b}, tolerance ${e}`);

test('real Clipper2 WASM solves Union/Intersection/Subtract/XOR with analytical rectangle areas and frozen input',async()=>{
 const ops=await operations(),a=rect(0,0,10,10),b=rect(5,0,10,10,true),original=structuredClone([a,b]);
 try{for(const [operation,expected]of [['union',150],['intersection',50],['subtract',50],['xor',100]] as const){const result=await ops.booleanPaths([a,b],{operation});close(sum(result),expected);for(const p of result)graphics.validatePathData(p);}assert.deepEqual([a,b],original);}
 finally{assert.deepEqual(await ops.dispose(),{mode:'cooperative',remainingSessions:0});}
});

test('each operand keeps its own evenodd/nonzero fill, hole ownership and nested islands',async()=>{
 const ops=await operations(),outer=polygon([[0,0],[10,0],[10,10],[0,10]],'o'),inner=polygon([[3,3],[7,3],[7,7],[3,7]],'i'),island=polygon([[4,4],[6,4],[6,6],[4,6]],'s');
 try{
  const ring=path([...outer,...inner],'evenodd'),solid=path([...outer,...inner],'nonzero');
  const result=await ops.booleanPaths([ring],{operation:'union'});assert.equal(result.length,1);assert.equal(result[0].commands.filter(c=>c.op==='M').length,2);close(sum(result),84);
  close(sum(await ops.booleanPaths([solid],{operation:'union'})),100);
  const nested=await ops.booleanPaths([path([...outer,...inner,...island],'evenodd')],{operation:'union'});assert.equal(nested.length,2);close(sum(nested),88);
  close(sum(await ops.booleanPaths([ring,solid],{operation:'intersection'})),84);
 }finally{await ops.dispose();}
});

test('true Offset/Inset respect hole topology, miter area, collapse and all four join algorithms',async()=>{
 const ops=await operations(),square=rect(0,0,10,10),ring=path([...square.commands,...polygon([[3,3],[3,7],[7,7],[7,3]],'h')]);
 try{
  close(sum(await ops.offsetPaths([square],{distance:2})),196);
  close(sum(await ops.offsetPaths([square],{distance:-2})),36);
  assert.equal((await ops.offsetPaths([square],{distance:-6})).length,0);
  close(sum(await ops.offsetPaths([ring],{distance:1})),140);
  close(sum(await ops.offsetPaths([ring],{distance:-1})),28);
  close(sum(await ops.offsetPaths([square],{distance:0})),100);
  const expected={miter:196,bevel:188,round:100+80+4*Math.PI};
  for(const join of ['miter','bevel','round','square'] as const){const a=sum(await ops.offsetPaths([square],{distance:2,join,tolerance:.001,arcTolerance:.001}));if(join==='square')assert.ok(a>expected.bevel&&a<expected.miter);else close(a,expected[join],join==='round'?.1:1e-7);}
 }finally{await ops.dispose();}
});

test('Bezier curves flatten adaptively without chord-line backtracking loss; closure policy is explicit',async()=>{
 const ops=await operations(),k=4/3*Math.tan(Math.PI/8),r=20,p=(id:string,x:number,y:number)=>({id,x,y});
 const circle=path([{op:'M',point:p('a',50+r,50)},{op:'C',control1:p('b',50+r,50+k*r),control2:p('c',50+k*r,50+r),point:p('d',50,50+r)},{op:'C',control1:p('e',50-k*r,50+r),control2:p('f',50-r,50+k*r),point:p('g',50-r,50)},{op:'C',control1:p('h',50-r,50-k*r),control2:p('i',50-k*r,50-r),point:p('j',50,50-r)},{op:'C',control1:p('l',50+k*r,50-r),control2:p('m',50+r,50-k*r),point:p('n',50+r,50)},{op:'Z'}]);
 try{
  const result=await ops.booleanPaths([circle],{operation:'union',tolerance:.002});close(sum(result),Math.PI*r*r,1);assert.ok(result[0].commands.every(c=>c.op==='M'||c.op==='L'||c.op==='Z'));
  const open=path([{op:'M',point:p('a',0,0)},{op:'L',point:p('b',10,0)},{op:'L',point:p('c',0,10)}]);close(sum(await ops.booleanPaths([open],{operation:'union'})),50);
  await assert.rejects(ops.booleanPaths([open],{operation:'union',openContours:'reject'}),{code:'E_PA_PATHOPS_CLOSURE'});
  const back=path([{op:'M',point:p('a',0,0)},{op:'C',control1:p('b',100,0),control2:p('c',-100,0),point:p('d',1,0)},{op:'L',point:p('e',1,10)},{op:'L',point:p('f',0,10)},{op:'Z'}]);
  await ops.booleanPaths([back],{operation:'union'});assert.ok((await ops.diagnostics()).lastOperation!.inputPoints>4,'finite-segment distance must detect collinear overshoot');
 }finally{await ops.dispose();}
});

test('random/repeated time, existing Signals and explicit numeric/grid errors leave the session reusable',async()=>{
 const ops=await operations(),square=rect(10,10,20,20),seen=new Map<number,string>(),signal=keyframes([{frame:0,value:-2},{frame:10,value:2}]);
 try{
  for(const frame of [5,0,10,3,5,10,0]){const p=await ops.offsetPaths([square],{distance:signal}, {frame} as any),json=JSON.stringify(p);if(seen.has(frame))assert.equal(json,seen.get(frame));seen.set(frame,json);}
  await assert.rejects(ops.offsetPaths([square],{distance:signal}),{code:'E_PA_PATHOPS_CONTEXT'});
  await assert.rejects(ops.booleanPaths([square],{operation:'union',gridSize:1e-30}),/E_PA_PATHOPS_GRID/);
  await assert.rejects(ops.offsetPaths([square],{distance:1e30}),/E_PA_PATHOPS_GRID/);
  await assert.rejects(ops.offsetPaths([square],{distance:10,miterLimit:1e308}),/E_PA_PATHOPS_GRID/);
  await assert.rejects(ops.booleanPaths([square],{operation:'union',tolerance:0}),{code:'E_PA_PATHOPS_PARAMETER'});
  close(sum(await ops.booleanPaths([square],{operation:'union'})),400);
 }finally{await ops.dispose();}
});

test('streaming results release on break, reject concurrent solves, and emit honest precision diagnostics',async()=>{
 const ops=await operations();
 try{
  const stream=ops.booleanPathsStream([rect(0,0,1,1),rect(10,0,1,1),rect(20,0,1,1)],{operation:'union'});assert.equal((await stream.next()).done,false);
  await assert.rejects(ops.offsetPaths([rect(0,0,1,1)],{distance:1}),{code:'E_PA_PATHOPS_BUSY'});await stream.return(undefined as any);assert.equal((await ops.diagnostics()).busy,false);
  const warnings:any[]=[];const tiny=path(polygon([[0,0],[.00001,0],[0,.00001]]));assert.equal((await ops.booleanPaths([tiny],{operation:'union',onDiagnostic:d=>warnings.push(d)})).length,0);assert.equal(warnings[0].code,'W_PA_PATHOPS_GRID_COLLAPSE');
  close(sum(await ops.booleanPaths([rect(0,0,2,2)],{operation:'union'})),4);
 }finally{await ops.dispose();}
});

test('canonical safety stays in force while transport chunks handle more than the old segment cap',async()=>{
 const ops=await operations();
 try{
  const n=5000,polygonPath=path(polygon(Array.from({length:n},(_,i)=>[100+50*Math.cos(i/n*Math.PI*2),90+50*Math.sin(i/n*Math.PI*2)])));
  const out=await ops.booleanPaths([polygonPath],{operation:'union',tolerance:.001});assert.equal(out.length,1);close(sum(out),Math.PI*2500,.1);assert.ok((await ops.diagnostics()).lastOperation!.inputPoints>=5000);
  const other={...rect(0,0,1,1),coordinates:{...polygonPath.coordinates,spaceId:'other'}};await assert.rejects(ops.booleanPaths([polygonPath,other],{operation:'union'}),{code:'E_PA_PATHOPS_SPACE'});
  const empty=await ops.booleanPaths([],{operation:'union'});assert.deepEqual(empty,[]);
 }finally{await ops.dispose();}
});

test('abort uses the existing owned Kit signal; terminated sessions do not claim verified Rust Drop',async()=>{
 const ops=await operations(),abort=new AbortController();
 function* input(){yield rect(0,0,1,1);abort.abort();yield rect(2,0,1,1);}
 await assert.rejects(ops.booleanPaths(input(),{operation:'union',signal:abort.signal}));assert.equal((await ops.diagnostics()).closed,true);assert.deepEqual(await ops.dispose(),{mode:'terminated'});
 await assert.rejects(ops.booleanPaths([rect(0,0,1,1)],{operation:'union'}),{code:'E_PA_PATHOPS_DISPOSED'});
});

test('cleanup failures retain the original diagnostic and terminate rather than publishing a false success',async()=>{
 const ops=await createPathOperations(graphics,async options=>{const kernel=await directFactory(options);return {...kernel,async reset(){await kernel.reset();throw Error('injected cleanup failure');}};});
 const a=rect(0,0,1,1),bad={...a,coordinates:{...a.coordinates,spaceId:'bad'}};
 await assert.rejects(ops.booleanPaths([a,bad],{operation:'union'}),(error:any)=>error.code==='E_PA_PATHOPS_CLEANUP'&&error.details.original.code==='E_PA_PATHOPS_SPACE'&&/injected/.test(error.details.cleanup.message));
 assert.deepEqual(await ops.dispose(),{mode:'terminated'});
});

test('records a warm real WASM geometry measurement without browser or GPU claims',async()=>{
 const ops=await operations(),times:number[]=[];
 try{for(let i=0;i<3;i++){const start=performance.now();const out=await ops.offsetPaths([rect(0,0,100,100),rect(50,20,100,100)],{distance:4,join:'round',tolerance:.002});assert.ok(sum(out)>16000);times.push(performance.now()-start);}}
 finally{await ops.dispose();}
 await mkdir('.frameweave/pa3-pathops',{recursive:true});await writeFile('.frameweave/pa3-pathops/L0-performance.json',JSON.stringify({backend:'real Rust/WASM via official Kit direct client',operation:'2-operand normalized union + round offset',processAlreadyWarm:true,samplesMs:times,noBrowser:true,noGPU:true},null,2));
});
