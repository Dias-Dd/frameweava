import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as graphics from '../modules/graphics-contracts/index.ts';
import {createPathOperations} from '../modules/pro-animation/src/path-operations.ts';
import {createPathTools} from '../modules/pro-animation/src/path-tools.ts';
import {keyframes} from '../src/core/animation.ts';
import type {PathData,PathCommand} from '../modules/graphics-contracts/types.ts';
import {operations,directFactory} from './helpers/pa3-pathops.ts';
const point=(id:string,x:number,y:number)=>({id,x,y});
const path=(commands:PathCommand[]):PathData=>({schema:'frameweave.path',version:1,id:'centerline',coordinates:{spaceId:'canvas',unit:'px',origin:'top-left',x:'right',y:'down',width:384,height:192},fillRule:'nonzero',commands});
const line=path([{op:'M',point:point('a',10,20)},{op:'L',point:point('b',20,20)}]);
const rectangle=path([{op:'M',point:point('a',10,10)},{op:'L',point:point('b',20,10)},{op:'L',point:point('c',20,20)},{op:'L',point:point('d',10,20)},{op:'Z'}]);
function area(paths:PathData[]){let result=0;for(const path of paths){let points:number[][]=[];const flush=()=>{for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];result+=(a[0]*b[1]-a[1]*b[0])/2;}points=[];};for(const c of path.commands){if(c.op==='M')flush();if(c.op!=='Z')points.push([c.point.x,c.point.y]);else flush();}flush();}return result;}
const close=(a:number,b:number,e=1e-6)=>assert.ok(Math.abs(a-b)<=e,`${a} vs ${b} within ${e}`);
const precision={tolerance:.001,gridSize:.00001,arcTolerance:.00001};

test('real Rust/WASM open stroke outlines have analytical butt/square/round area and cap extents',async()=>{
 const ops=await operations();try{for(const [cap,expected,left,right]of [['butt',20,10,20],['square',24,9,21],['round',20+Math.PI,9,21]] as const){const out=await ops.strokePaths([line],{width:2,cap,...precision,...cap==='round'?{gridSize:1e-7,arcTolerance:2e-7}:{}});close(area(out),expected,cap==='round'?.001:1e-6);const x=out.flatMap(p=>p.commands.flatMap(c=>c.op==='Z'?[]:[c.point.x]));close(Math.min(...x),left);close(Math.max(...x),right);for(const p of out)graphics.validatePathData(p);}}
 finally{assert.deepEqual(await ops.dispose(),{mode:'cooperative',remainingSessions:0});}
});

test('closed stroke creates a true ring with a hole rather than filling the polygon; cap does not affect closed joins',async()=>{
 const ops=await operations();try{let expected:PathData[]|undefined;for(const cap of ['butt','round','square'] as const){const out=await ops.strokePaths([rectangle],{width:2,cap,join:'miter',...precision});close(area(out),80);assert.equal(out.length,1);assert.equal(out[0].commands.filter(c=>c.op==='M').length,2);if(expected)assert.deepEqual(out,expected);expected=out;}
  assert.deepEqual(await ops.strokePaths([rectangle],{width:0}),[]);await assert.rejects(ops.strokePaths([line],{width:-1}),{code:'E_PA_PATHOPS_PARAMETER'});
 }finally{await ops.dispose();}
});

test('quadratic and cubic centerlines preserve controlled outline area against independent arc-length references',async()=>{
 const ops=await operations(),measure=createPathTools(graphics);
 const curves=[path([{op:'M',point:point('a',30,30)},{op:'Q',control:point('q',80,100),point:point('b',130,30)}]),path([{op:'M',point:point('a',30,30)},{op:'C',control1:point('c',40,100),control2:point('d',120,100),point:point('b',130,30)}])];
 try{for(const curve of curves){const length=measure.measurePath(curve,{tolerance:.00001}).length,out=await ops.strokePaths([curve],{width:2,cap:'round',join:'round',tolerance:.0001,gridSize:.00001,arcTolerance:.00001});close(area(out),2*length+Math.PI,.01);}}
 finally{await ops.dispose();}
});

test('four real joins and miter limit alter the outlined geometry; stroke width Signal is random-access deterministic',async()=>{
 const ops=await operations(),corner=path([{op:'M',point:point('a',10,80)},{op:'L',point:point('b',80,20)},{op:'L',point:point('c',50,80)}]),areas:number[]=[];
 try{for(const join of ['miter','round','bevel','square'] as const){const out=await ops.strokePaths([corner],{width:8,join,miterLimit:20,...precision});assert.ok(area(out)>0);areas.push(area(out));}assert.ok(new Set(areas).size>=3,JSON.stringify(areas));const limited=await ops.strokePaths([corner],{width:8,join:'miter',miterLimit:2,...precision});assert.ok(area(limited)<areas[0]);
  const width=keyframes([{frame:0,value:1},{frame:10,value:4,easing:'easeIn'}]),seen=new Map<number,PathData[]>();for(const frame of [5,0,10,3,5,10]){const out=await ops.strokePaths([line],{width,...precision},{frame} as any);if(seen.has(frame))assert.deepEqual(out,seen.get(frame));seen.set(frame,out);}close(area(seen.get(0)!),10);close(area(seen.get(10)!),40);
 }finally{await ops.dispose();}
});

test('stroke diagnostics cover quantized/degenerate centerlines and insufficient kernel profiles; errors leave the client reusable',async()=>{
 const ops=await operations();try{const warnings:any[]=[];const out=await ops.strokePaths([path([{op:'M',point:point('a',0,0)}])],{width:2,onDiagnostic:d=>warnings.push(d)});assert.deepEqual(out,[]);assert.equal(warnings[0].code,'W_PA_PATHOPS_GRID_COLLAPSE');
  await assert.rejects(ops.strokePaths([line],{width:.00001,gridSize:1}),/grid|resolution/i);await assert.rejects(ops.strokePaths([line],{width:2,cap:'invalid'} as any),{code:'E_PA_PATHOPS_PARAMETER'});close(area(await ops.strokePaths([line],{width:2})),20);
 }finally{await ops.dispose();}
 const older=await createPathOperations(graphics,async options=>{const api=await directFactory(options);return {...api,stroke:undefined,finish_stroke_contour:undefined};});try{await assert.rejects(older.strokePaths([line],{width:2}),{code:'E_PA_PATHOPS_CAPABILITY'});close(area(await older.booleanPaths([rectangle],{operation:'union'})),100);}finally{await older.dispose();}
});

test('stroke streams and multi-contour outlines share the existing chunk/cleanup lifecycle',async()=>{
 const ops=await operations();try{const separated=path([...line.commands,{op:'M',point:point('c',40,40)},{op:'L',point:point('d',50,40)}]),stream=ops.strokePathsStream([separated],{width:2});assert.equal((await stream.next()).done,false);await assert.rejects(ops.strokePaths([line],{width:2}),{code:'E_PA_PATHOPS_BUSY'});await stream.return(undefined as any);assert.equal((await ops.diagnostics()).busy,false);close(area(await ops.strokePaths([separated],{width:2})),40);}
 finally{await ops.dispose();}
});
