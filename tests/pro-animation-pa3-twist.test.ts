import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as graphics from '../modules/graphics-contracts/index.ts';
import {createPathTwist} from '../modules/pro-animation/src/path-twist.ts';
import {directTwistFactory} from './helpers/pa3-twist.ts';
import {keyframes} from '../src/core/animation.ts';
const coordinates={spaceId:'canvas',unit:'px' as const,origin:'top-left' as const,x:'right' as const,y:'down' as const,width:640,height:240};
const line=()=>graphics.validatePathData({schema:'frameweave.path',version:1,id:'line',coordinates,fillRule:'nonzero',commands:[{op:'M',point:{id:'a',x:0,y:0}},{op:'L',point:{id:'b',x:100,y:0}}]});
const ctx=(frame:number)=>({frame,time:frame/12,fps:12,globalTime:frame/12,seed:1} as any);
test('real adaptive Rust Twist emits canonical cubics with analytic endpoints and explicit bound instead of silent64 cap',async()=>{
 const client=await createPathTwist(graphics,directTwistFactory);try{
  const [a]=await client.twistPaths([line()],{angleDegrees:90,center:[0,0],radius:100,accuracy:1e-3});assert.ok(a.commands.length>64&&a.commands.length<=graphics.LIMITS.commands);assert.deepEqual(a.coordinates,coordinates);assert.deepEqual(graphics.validatePathData(a),a);
  const end=a.commands.at(-1)!;assert.equal(end.op,'C');if(end.op==='C')assert.ok(Math.hypot(end.point.x,end.point.y-100)<=1e-12);
  const metrics=(await client.diagnostics()).lastGeometry!;assert.ok(metrics.errorBound<=1e-3&&metrics.errorBound>0);assert.equal(metrics.commands,a.commands.length);assert.equal(metrics.radius,100);assert.ok(metrics.subdivisions>64);assert.deepEqual(metrics.center,[0,0]);assert.ok(Object.isFrozen(metrics));
 }finally{assert.deepEqual(await client.dispose(),{mode:'cooperative',remainingSessions:0});}
});
test('real closed loop with center endpoints uses control hull radius, keeps holes/closure and zero angle identity',async()=>{
 const client=await createPathTwist(graphics,directTwistFactory);try{
  const p=line();p.fillRule='evenodd';p.commands=[{op:'M',point:{id:'a',x:0,y:0}},{op:'C',control1:{id:'b',x:100,y:100},control2:{id:'c',x:-100,y:100},point:{id:'d',x:0,y:0}},{op:'Z'},{op:'M',point:{id:'e',x:0,y:20}},{op:'L',point:{id:'f',x:10,y:30}},{op:'L',point:{id:'g',x:0,y:40}},{op:'Z'}];
  const [out]=await client.twistPaths([p],{angleDegrees:90,center:[0,0]});assert.equal(out.fillRule,'evenodd');assert.equal(out.commands.filter(c=>c.op==='Z').length,2);assert.equal(out.commands.filter(c=>c.op==='M').length,2);assert.ok(Math.abs((await client.diagnostics()).lastGeometry!.radius-Math.hypot(100,100))<1e-12);assert.notDeepEqual(out.commands,p.commands);
  const [same]=await client.twistPaths([p],{angleDegrees:0});assert.deepEqual(same,p);assert.equal((await client.diagnostics()).lastGeometry,null,'Neutral path has no kernel query');
 }finally{await client.dispose();}
});
test('default center inherits each physical coordinate extent and explicit normalizing radius is observable',async()=>{
 const client=await createPathTwist(graphics,directTwistFactory);try{const p=line();await client.twistPaths([p],{angleDegrees:15});assert.deepEqual((await client.diagnostics()).lastGeometry!.center,[320,120]);p.coordinates.width=1920;p.coordinates.height=1080;await client.twistPaths([p],{angleDegrees:15,radius:1000});const d=(await client.diagnostics()).lastGeometry!;assert.deepEqual(d.center,[960,540]);assert.equal(d.radius,1000);}finally{await client.dispose();}
});
test('Core Signals, captured options and random/repeated frames remain deterministic without history',async()=>{
 const client=await createPathTwist(graphics,directTwistFactory),angle=keyframes<number>([{frame:0,value:-20},{frame:11,value:70,easing:'easeInOut'}]),seen=new Map<number,unknown>();try{for(const frame of [5,0,11,3,5,11,0]){const out=await client.twistPaths([line()],{angleDegrees:angle,center:[50,0]},ctx(frame));if(seen.has(frame))assert.deepEqual(out,seen.get(frame));seen.set(frame,out);}assert.notDeepEqual(seen.get(0),seen.get(11));
  const center:[number,number]=[0,0],p={angleDegrees:90,center,radius:100},pending=client.twistPaths([line()],p);p.angleDegrees=0;center[0]=999;const end=(await pending)[0].commands.at(-1)!;if(end.op!=='Z')assert.ok(Math.hypot(end.point.x,end.point.y-100)<1e-12);
 }finally{await client.dispose();}
});
test('lazy paths preserve busy/cleanup boundaries; invalid precision/parameters and caller budgets are explicit',async()=>{
 const client=await createPathTwist(graphics,directTwistFactory);try{
  let seen=0;function* inputs(){for(let i=0;i<10000;i++){seen++;yield line();}}const stream=client.twistPathsStream(inputs(),{angleDegrees:30,center:[0,0]});await stream.next();assert.equal(seen,1);await assert.rejects(client.twistPaths([line()]),{code:'E_PA_TWIST_BUSY'});await stream.return(undefined);assert.equal(seen,1);
  for(const p of [{radius:0},{radius:-1},{accuracy:0},{angleDegrees:NaN},{center:[0]},{maxOutputCommands:0},{backend:'cpu'}])await assert.rejects(client.twistPaths([line()],p as any),{code:'E_PA_TWIST_PARAMETER'});
  await assert.rejects(client.twistPaths([line()],{angleDegrees:90,center:[0,0],maxOutputCommands:2}),{code:'E_PA_TWIST_BUDGET'});assert.equal((await client.diagnostics()).lastGeometry,null);await assert.rejects(client.twistPaths([line()],{angleDegrees:90,center:[1e12,1e12],accuracy:1e-4}),{code:'E_PA_TWIST_PRECISION'});
  assert.ok((await client.twistPaths([line()],{angleDegrees:20}))[0].commands.length>0);
 }finally{await client.dispose();}
});
test('active cancellation is terminal only for owned client and cleanup failure remains observable',async()=>{
 const client=await createPathTwist(graphics,directTwistFactory),pre=new AbortController();pre.abort();await assert.rejects(client.twistPaths([line()],{signal:pre.signal}),{code:'E_PA_TWIST_CANCELLED'});await client.twistPaths([line()],{angleDegrees:10});const abort=new AbortController(),operation=client.twistPaths([line()],{angleDegrees:90,signal:abort.signal});abort.abort();await assert.rejects(operation,{code:'E_PA_TWIST_CANCELLED'});assert.deepEqual(await client.dispose(),{mode:'terminated'});
 const broken=await createPathTwist(graphics,async p=>{const actual=await directTwistFactory(p);return {...actual,async reset(){await actual.reset();throw Error('injected cleanup fault');}};});await assert.rejects(broken.twistPaths([line()],{angleDegrees:10}),{code:'E_PA_TWIST_CLEANUP'});assert.deepEqual(await broken.dispose(),{mode:'terminated'});
});
test('genuine kernel state/range errors expose no prior result; invalid bound metadata is rejected and reset',async()=>{
 const raw=await directTwistFactory({signal:new AbortController().signal});try{await assert.rejects(raw.metadata(),/E_PA_TWIST_STATE/);await raw.begin();await raw.append(new Float64Array([1,0,0,2,100,0]));await assert.rejects(raw.twist(90,0,0,100,1e-3,2),/E_PA_TWIST_BUDGET/);await assert.rejects(raw.metadata(),/E_PA_TWIST_STATE/);await raw.twist(90,0,0,100,1e-3,8192);assert.ok((await raw.metadata())[2]<=1e-3);await assert.rejects(raw.read_output(999999,1),/E_PA_TWIST_RANGE/);await assert.rejects(raw.twist(90,0,0,100,1e-3,8192),/E_PA_TWIST_STATE/);await assert.rejects(raw.metadata(),/E_PA_TWIST_STATE/);}finally{await raw.dispose();}
 let once=true;const checked=await createPathTwist(graphics,async p=>{const actual=await directTwistFactory(p);return {...actual,async metadata(){const m=await actual.metadata();if(once){once=false;m[2]=1;}return m;}};});try{await assert.rejects(checked.twistPaths([line()],{angleDegrees:10}),{code:'E_PA_TWIST_OUTPUT'});assert.ok((await checked.twistPaths([line()],{angleDegrees:10}))[0].commands.length>0);}finally{await checked.dispose();}
});

test('independent exact-degree Gaussian area reference checks the radial map area invariant on a real compound path',async()=>{
 // Three-point Gauss-Legendre exactly integrates x*y'-y*x' of cubic polynomials (degree<=5).
 // This is a numeric oracle only, not another path rendering/query implementation.
 const area=(path:ReturnType<typeof line>)=>{let result=0,start:[number,number]=[0,0],last:[number,number]=[0,0];const cross=(a:readonly number[],b:readonly number[])=>a[0]*b[1]-a[1]*b[0];for(const c of path.commands){
  if(c.op==='M'){start=[c.point.x,c.point.y];last=start;continue;}if(c.op==='Z'){result+=cross(last,start)/2;last=start;continue;}if(c.op==='L'){const end:[number,number]=[c.point.x,c.point.y];result+=cross(last,end)/2;last=end;continue;}if(c.op!=='C')throw Error('This reference fixture uses only lines/cubics');
  const p=[last,[c.control1.x,c.control1.y],[c.control2.x,c.control2.y],[c.point.x,c.point.y]];
  for(const [node,weight]of [[-Math.sqrt(3/5),5/9],[0,8/9],[Math.sqrt(3/5),5/9]]){const t=(node+1)/2,u=1-t,pos=[0,0],d=[0,0];for(let axis=0;axis<2;axis++){pos[axis]=u**3*p[0][axis]+3*u*u*t*p[1][axis]+3*u*t*t*p[2][axis]+t**3*p[3][axis];d[axis]=3*u*u*(p[1][axis]-p[0][axis])+6*u*t*(p[2][axis]-p[1][axis])+3*t*t*(p[3][axis]-p[2][axis]);}result+=weight*cross(pos,d)/4;}last=[c.point.x,c.point.y];
 }return result;};
 const p=line();p.commands.push({op:'L',point:{id:'c',x:100,y:100}},{op:'L',point:{id:'d',x:0,y:100}},{op:'Z'},{op:'M',point:{id:'e',x:25,y:25}},{op:'L',point:{id:'f',x:25,y:75}},{op:'L',point:{id:'g',x:75,y:75}},{op:'L',point:{id:'h',x:75,y:25}},{op:'Z'});assert.equal(area(p),7500);
 const client=await createPathTwist(graphics,directTwistFactory);try{const [out]=await client.twistPaths([p],{angleDegrees:90,center:[50,50],radius:100,accuracy:1e-3});const error=Math.abs(area(out)-7500);assert.ok(error<=1e-2,`Area error ${error} px²; predeclared .01`);const {mkdir,writeFile}=await import('node:fs/promises');await mkdir('.frameweave/pa3-twist',{recursive:true});await writeFile('.frameweave/pa3-twist/area-reference.json',JSON.stringify({reference:'Exact-degree 3-point Gaussian cubic signed-area integration; radial map detJ=1 in real arithmetic',sourceArea:7500,outputArea:area(out),absoluteError:error,budgetPxSquared:1e-2}));}finally{await client.dispose();}
});
