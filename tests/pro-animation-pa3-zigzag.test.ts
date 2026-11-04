import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as graphics from '../modules/graphics-contracts/index.ts';
import {createPathZigzag} from '../modules/pro-animation/src/path-zigzag.ts';
import {directZigzagFactory} from './helpers/pa3-zigzag.ts';
import {keyframes} from '../src/core/animation.ts';
const coordinates={spaceId:'canvas',unit:'px' as const,origin:'top-left' as const,x:'right' as const,y:'down' as const,width:640,height:240};
const line=()=>graphics.validatePathData({schema:'frameweave.path',version:1,id:'line',coordinates,fillRule:'nonzero',commands:[{op:'M',point:{id:'a',x:0,y:0}},{op:'L',point:{id:'b',x:100,y:0}}]});
const ctx=(frame:number)=>({frame,time:frame/12,fps:12,globalTime:frame/12,seed:1} as any);
test('actual original Rust/kurbo WASM produces analytic corners and smooth cubics, preserving canonical coordinates',async()=>{
 const client=await createPathZigzag(graphics,directZigzagFactory);try{
  const [a]=await client.zigzagPaths([line()],{size:2,ridges:3});assert.equal(a.commands.length,5);assert.deepEqual(a.coordinates,coordinates);assert.equal(a.fillRule,'nonzero');for(const [i,c]of a.commands.entries()){if(c.op==='Z')throw Error('Expected point');assert.equal(c.point.x,i*25);assert.equal(c.point.y,i%2?-2:2);}assert.deepEqual(graphics.validatePathData(a),a);
  const [b]=await client.zigzagPaths([line()],{size:2,ridges:3,smooth:true});assert.equal(b.commands[1].op,'C');if(b.commands[1].op!=='C')throw Error('Expected cubic');assert.deepEqual([b.commands[1].control1.x,b.commands[1].control1.y,b.commands[1].control2.x,b.commands[1].control2.y],[9,2,16,-2]);
  const [large]=await client.zigzagPaths([line()],{size:2,ridges:1100});assert.equal(large.commands.length,1102,'No inherited silent clamp1000');const [identity]=await client.zigzagPaths([line()],{size:0,ridges:10});assert.deepEqual(identity,line());
 }finally{assert.deepEqual(await client.dispose(),{mode:'cooperative',remainingSessions:0});}
});
test('closed contours, holes and exact degenerate subpaths remain one canonical path without splitting fill semantics',async()=>{
 const client=await createPathZigzag(graphics,directZigzagFactory);try{
  const p=line();p.fillRule='evenodd';p.commands.push({op:'L',point:{id:'c',x:100,y:100}},{op:'L',point:{id:'d',x:0,y:100}},{op:'Z'},{op:'M',point:{id:'e',x:20,y:20}},{op:'L',point:{id:'f',x:30,y:40}},{op:'L',point:{id:'g',x:40,y:20}},{op:'Z'},{op:'M',point:{id:'h',x:200,y:50}},{op:'Z'});
  const result=await client.zigzagPaths([p],{size:1,ridges:2});assert.equal(result.length,1);assert.equal(result[0].fillRule,'evenodd');assert.equal(result[0].commands.filter(c=>c.op==='M').length,3);assert.equal(result[0].commands.filter(c=>c.op==='Z').length,3);const point=result[0].commands.at(-2)!;assert.equal(point.op,'M');assert.deepEqual([point.point.x,point.point.y],[200,50]);graphics.validatePathData(result[0]);
 }finally{await client.dispose();}
});
test('existing keyframes and random frame order remain deterministic with captured numeric options',async()=>{
 const client=await createPathZigzag(graphics,directZigzagFactory),size=keyframes<number>([{frame:0,value:1},{frame:11,value:8,easing:'easeInOut'}]),seen=new Map<number,unknown>();try{for(const frame of [5,0,11,3,5,11,0]){const result=await client.zigzagPaths([line()],{size,ridges:7,smooth:true},ctx(frame));if(seen.has(frame))assert.deepEqual(result,seen.get(frame));seen.set(frame,result);}assert.notDeepEqual(seen.get(0),seen.get(11));
  const p={size:2,ridges:3},pending=client.zigzagPaths([line()],p);p.size=99;p.ridges=9000;assert.equal((await pending)[0].commands.length,5);
 }finally{await client.dispose();}
});
test('streaming, inherited output contract, resource and numeric failures permit clean reuse',async()=>{
 const client=await createPathZigzag(graphics,directZigzagFactory);try{
  let produced=0;function* inputs(){for(let i=0;i<10000;i++){produced++;yield line();}}const iterator=client.zigzagPathsStream(inputs(),{size:2,ridges:1});assert.equal((await iterator.next()).done,false);assert.equal(produced,1);await assert.rejects(client.zigzagPaths([line()]),{code:'E_PA_ZIGZAG_BUSY'});await iterator.return(undefined);assert.equal(produced,1);
  for(const p of [{ridges:-1},{size:Infinity},{smooth:'yes'},{accuracy:0},{maxOutputCommands:0},{extra:2}])await assert.rejects(client.zigzagPaths([line()],p as any),{code:'E_PA_ZIGZAG_PARAMETER'});
  await assert.rejects(client.zigzagPaths([line()],{ridges:9000}),{code:'E_PA_ZIGZAG_BUDGET'});await assert.rejects(client.zigzagPaths([line()],{ridges:4,maxOutputCommands:2}),{code:'E_PA_ZIGZAG_BUDGET'});
  const tiny=line();if(tiny.commands[1].op!=='Z')tiny.commands[1].point.x=1e-10;await assert.rejects(client.zigzagPaths([tiny]),{code:'E_PA_ZIGZAG_PRECISION'});assert.equal((await client.zigzagPaths([line()],{ridges:3}))[0].commands.length,5);assert.equal((await client.diagnostics()).busy,false);
 }finally{await client.dispose();}
});
test('active cancel closes only the owned Kit client; pre-cancel and kernel failure/cleanup remain observable',async()=>{
 const client=await createPathZigzag(graphics,directZigzagFactory),pre=new AbortController();pre.abort();await assert.rejects(client.zigzagPaths([line()],{signal:pre.signal}),{code:'E_PA_ZIGZAG_CANCELLED'});assert.equal((await client.zigzagPaths([line()],{ridges:1})).length,1);
 const active=new AbortController(),query=client.zigzagPaths([line()],{signal:active.signal});active.abort();await assert.rejects(query,{code:'E_PA_ZIGZAG_CANCELLED'});assert.deepEqual(await client.dispose(),{mode:'terminated'});await assert.rejects(client.zigzagPaths([line()]),{code:'E_PA_ZIGZAG_CLOSED'});
 const broken=await createPathZigzag(graphics,async p=>{const actual=await directZigzagFactory(p);return {...actual,async reset(){await actual.reset();throw Error('injected cleanup fault');}};});await assert.rejects(broken.zigzagPaths([line()]),{code:'E_PA_ZIGZAG_CLEANUP'});assert.deepEqual(await broken.dispose(),{mode:'terminated'});
});

test('real data kernel never exposes prior success after failure, and corrupted transport is diagnosed before publish',async()=>{
 const raw=await directZigzagFactory({signal:new AbortController().signal});try{
  await assert.rejects(raw.metadata(),/E_PA_ZIGZAG_STATE/);await raw.begin();await assert.rejects(raw.append(new Float64Array([1,0,0,2,100])),/E_PA_ZIGZAG_INPUT/);await raw.append(new Float64Array([1,0,0,2,100,0]));
  await assert.rejects(raw.zigzag(2,3,false,1e-4,4),/E_PA_ZIGZAG_BUDGET/);await assert.rejects(raw.metadata(),/E_PA_ZIGZAG_STATE/);assert.equal(await raw.zigzag(2,3,false,1e-4,8192),5);assert.equal((await raw.metadata())[0],5);
  await assert.rejects(raw.read_output(999,1),/E_PA_ZIGZAG_RANGE/);await assert.rejects(raw.zigzag(2,3,false,1e-4,8192),/E_PA_ZIGZAG_STATE/);await assert.rejects(raw.metadata(),/E_PA_ZIGZAG_STATE/);await raw.reset();
 }finally{await raw.dispose();}
 let once=true;const client=await createPathZigzag(graphics,async p=>{const actual=await directZigzagFactory(p);return {...actual,async metadata(){const m=await actual.metadata();if(once){once=false;m[1]=0;}return m;}};});try{await assert.rejects(client.zigzagPaths([line()]),{code:'E_PA_ZIGZAG_OUTPUT'});assert.ok((await client.zigzagPaths([line()]))[0].commands.length>0);}finally{await client.dispose();}
});
