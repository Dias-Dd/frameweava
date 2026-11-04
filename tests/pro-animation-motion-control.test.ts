import test from 'node:test';
import assert from 'node:assert/strict';
import type {FrameContext} from '../src/core/types.ts';
import {keyframes,expr,spring,springAt} from '../src/core/animation.ts';
import {createInertia} from '../modules/pro-animation/src/inertia.ts';
import * as m from '../modules/pro-animation/src/motion-control/index.ts';
const c:FrameContext={frame:12,time:.5,globalFrame:24,globalTime:1,dt:1/48,fps:{num:24,den:1},durationInFrames:49,progress:.5,seed:37};
const near=(a:number,b:number,tolerance=1e-10)=>assert.ok(Math.abs(a-b)<=tolerance,JSON.stringify({a,b,tolerance}));
const pointNear=(a:readonly number[],b:readonly number[],tolerance=1e-10)=>a.forEach((v,i)=>near(v,b[i],tolerance));
test('26 public functional exports, no lifecycle/helper/alias inflation',()=>{assert.equal(Object.values(m).filter(v=>typeof v==='function').length,26);});
test('signal source snapshots existing keyframes and dynamic affine controls use existing conventions',()=>{
 const x=keyframes<number>([{frame:0,value:0},{frame:24,value:48}]),source=m.signalMotion2D([x,expr.mul(expr.time,10)]);x.$keyframes[1].value=1000;pointNear(source(c),[24,5]);
 const transformed=m.transformMotion2D(()=>[2,1],{x:10,y:-2,rotationDegrees:90,scaleX:2,origin:[1,1]});pointNear(transformed(c),[11,1]);
 const mixed=m.blendMotion2D(()=>[0,0],()=>[10,20],keyframes([{frame:0,value:0},{frame:24,value:1}]));pointNear(mixed(c),[5,10]);
});
test('orbit, independent oscillation and both spiral families have actual numeric positions',()=>{
 pointNear(m.orbitMotion2D({center:[10,20],radius:[4,2],frequency:.5})(c),[10,22]);
 pointNear(m.orbitMotion2D({center:[0,0],radius:[4,2],frequency:0,rotationDegrees:90})(c),[0,4]);
 pointNear(m.oscillateMotion2D({center:[1,2],amplitude:[4,3],frequencies:[.5,1],phasesDegrees:[0,90]})(c),[5,-1]);
 pointNear(m.spiralMotion2D({center:[1,2],radius:2,growth:4,frequency:1})(c),[-3,2]);
 pointNear(m.spiralMotion2D({center:[0,0],radius:2,growth:Math.log(4),growthMode:'exponential',frequency:0})(c),[4,0]);
});
test('cubic parameter motion reuses real existing geometry with clamp/error/extension',()=>{
 const points=[[0,0],[0,4],[4,4],[4,0]] as const;pointNear(m.bezierMotion2D({points})(c),[2,3]);
 pointNear(m.bezierMotion2D({points,progress:2})(c),[4,0]);assert.throws(()=>m.bezierMotion2D({points,progress:2,boundary:'error'})(c));
 pointNear(m.bezierMotion2D({points,progress:2,boundary:'extend'})(c),[-16,-24]);
});
test('dual-axis spring and inertia exactly reuse the existing qualified scalar implementations',()=>{
 const springOptions={from:[0,1] as const,to:[10,20] as const,velocity:[2,-1] as const,stiffness:170,damping:26,mass:1,startFrame:2},s=m.springMotion2D(springOptions);
 pointNear(s(c),[0,1].map((v,i)=>springAt(spring({from:v,to:springOptions.to[i],velocity:springOptions.velocity[i],stiffness:170,damping:26,mass:1,start:2}),c)),0);
 const inertia=m.inertiaMotion2D({from:[0,2],velocity:[50,-20],timeConstantSeconds:.4,startFrame:1,boundsX:{max:4}});
 pointNear(inertia(c),[createInertia({from:0,velocity:50,timeConstantSeconds:.4,startFrame:1,bounds:{max:4}}).valueAt(c),createInertia({from:2,velocity:-20,timeConstantSeconds:.4,startFrame:1}).valueAt(c)],0);
});
test('stagger and loop use real affine Stage samples; explicitly local clock preserves global output',()=>{
 const input:m.MotionSource2D=ctx=>[ctx.globalFrame,ctx.frame],delayed=m.staggerMotion2D(input,{index:2,delaySeconds:.0625});pointNear(delayed(c),[18,9]);
 pointNear(m.staggerMotion2D(input,{index:2,delaySeconds:.0625,clock:'local'})(c),[24,9]);
 const position:m.MotionSource2D=ctx=>[ctx.time,2*ctx.time];
 pointNear(m.loopMotion2D(position,{start:0,duration:.2})(c),[.1,.2]);
 pointNear(m.loopMotion2D(position,{start:0,duration:.2,mode:'ping-pong'})(c),[.1,.2]);
 pointNear(m.loopMotion2D(position,{start:0,duration:.2,mode:'offset'})(c),[.5,1]);
});
test('Richardson velocity/acceleration match polynomial and sinusoidal analytic references',()=>{
 const s=m.sampleMotion2D(ctx=>[ctx.time**3,Math.sin(2*ctx.time)],c,{stepSeconds:1/512});pointNear(s.position,[.125,Math.sin(1)]);pointNear(s.velocity,[.75,2*Math.cos(1)],1e-9);pointNear(s.acceleration,[3,-4*Math.sin(1)],2e-9);assert.equal(s.derivative,'finite-difference');assert.ok(Object.isFrozen(s));
 for(const scheme of ['forward','backward'] as const){const q=m.sampleMotion2D(ctx=>[3*ctx.time**2,ctx.time**3],c,{scheme,stepSeconds:1/128});pointNear(q.velocity,[3,.75],1e-12);pointNear(q.acceleration,[6,3],1e-12);}
});
test('derivative clock distinguishes output/global motion from local-only expressions',()=>{
 const source:m.MotionSource2D=ctx=>[ctx.globalTime,ctx.globalFrame];pointNear(m.sampleMotion2D(source,c).velocity,[2,48]);pointNear(m.sampleMotion2D(source,c,{clock:'local'}).velocity,[0,0]);
 const p=m.predictMotion2D({position:[1,2],velocity:[3,4],acceleration:[2,-2]},2,{acceleration:true});pointNear(p.position,[11,6]);assert.equal(p.kind,'constant-acceleration');
});
test('box, annulus, line/segment/ray, halfplane and wedge are actual closed constraints',()=>{
 pointNear(m.constrainBox2D([-2,5],{min:[0,0],max:[3,4]}).position,[0,4]);
 pointNear(m.constrainDistance2D([6,8],{center:[0,0],min:2,max:5}).position,[3,4]);
 pointNear(m.constrainDistance2D([0,0],{center:[0,0],min:2,max:5,restDirection:[0,2]}).position,[0,2]);
 pointNear(m.constrainLine2D([3,4],{from:[0,0],to:[2,0]}).position,[2,0]);
 pointNear(m.constrainLine2D([3,4],{from:[0,0],to:[2,0],extent:'line'}).position,[3,0]);
 pointNear(m.constrainLine2D([-2,4],{from:[0,0],to:[2,0],extent:'ray'}).position,[0,0]);
 pointNear(m.constrainHalfPlane2D([-3,4],{origin:[0,0],normal:[2,0],minDistance:1}).position,[1,4]);
 pointNear(m.constrainAngle2D([0,2],{center:[0,0],limitsDegrees:[-45,45]}).position,[Math.SQRT2,Math.SQRT2]);
});
test('projection invariants and idempotence over deterministic nontrivial points',()=>{
 for(let i=0;i<101;i++){const p:[number,number]=[Math.sin(i*.71)*20,Math.cos(i*.37)*20],a=m.constrainLine2D(p,{from:[1,-2],to:[5,1],extent:'line'}).position,b=m.constrainLine2D(a,{from:[1,-2],to:[5,1],extent:'line'}).position;pointNear(a,b,1e-13);near((p[0]-a[0])*4+(p[1]-a[1])*3,0,8e-14);
  const circle=m.constrainDistance2D(p,{center:[1,2],min:3,max:7}).position,r=Math.hypot(circle[0]-1,circle[1]-2);assert.ok(r>=3-1e-14&&r<=7+1e-14);pointNear(m.constrainDistance2D(circle,{center:[1,2],min:3,max:7}).position,circle,1e-13);
 }
});
test('grid/guide snap thresholds, ties and immutable guide inputs',()=>{
 pointNear(m.snapGrid2D([-5,16],{step:[10,10]}).position,[0,20]);pointNear(m.snapGrid2D([4,4],{step:[10,10],maxDistance:2}).position,[4,4]);
 const guides={x:[1,3],y:[-1,5],maxDistance:2},before=structuredClone(guides);pointNear(m.snapGuides2D([2,4],guides).position,[1,5]);assert.deepEqual(guides,before);
});
test('wrap and mirrored spatial tiling have explicit seam/negative-cycle semantics',()=>{
 const bounds={min:[0,0] as const,max:[10,20] as const};pointNear(m.wrapPosition2D([10,-1],bounds).position,[0,19]);pointNear(m.mirrorPosition2D([12,-3],bounds).position,[8,3]);pointNear(m.mirrorPosition2D([20,40],bounds).position,[0,0]);
});
test('orientation reuses aim, stretch preserves area and turn bank has correct sign',()=>{
 near(m.orientMotion2D({velocity:[0,2]}).rotationDegrees,90);near(m.orientMotion2D({velocity:[0,0]},{restDegrees:17}).rotationDegrees,17);
 const stretch=m.stretchMotion2D({velocity:[3,4]},{referenceSpeed:5});near(stretch.scaleX,2);near(stretch.scaleY,.5);near(stretch.areaScale,1);
 const bank=m.bankMotion2D({velocity:[2,0],acceleration:[0,4]},{referenceAcceleration:4});near(bank.rotationDegrees,45);near(bank.lateralAcceleration,4);assert.equal(m.bankMotion2D({velocity:[0,0],acceleration:[0,4]},{referenceAcceleration:4}).status,'stationary');
});
test('stable lead-target quadratic handles stationary, tangent, equal-speed and unreachable targets',()=>{
 near(m.leadTarget2D([0,0],[10,0],[0,0],{speed:5}).timeSeconds!,2);
 near(m.leadTarget2D([0,0],[10,0],[1,0],{speed:5}).timeSeconds!,2.5);
 near(m.leadTarget2D([0,0],[10,0],[0,3],{speed:5}).timeSeconds!,2.5);
 near(m.leadTarget2D([0,0],[10,0],[-5,0],{speed:5}).timeSeconds!,1);
 assert.equal(m.leadTarget2D([0,0],[10,0],[6,0],{speed:5}).status,'unreachable');assert.equal(m.leadTarget2D([0,0],[10,0],[0,0],{speed:5,maxTimeSeconds:1}).status,'unreachable');assert.equal(m.leadTarget2D([0,0],[0,0],[1,0],{speed:5}).status,'coincident');
 near(m.leadTarget2D([0,0],[1e100,0],[1e98,0],{speed:5e98}).timeSeconds!,25,1e-12);
 near(m.leadTarget2D([0,0],[1e-200,0],[1e-201,0],{speed:3e-201}).timeSeconds!,5,1e-12);
});
test('sources and composed constraints are stateless for shuffled/repeated fractional frames',()=>{
 const source=m.loopMotion2D(m.transformMotion2D(m.orbitMotion2D({center:[0,0],radius:[4,2],frequency:.5}),{rotationDegrees:expr.mul(expr.time,30)}),{start:0,duration:2});const order=[.5,1.25,-.5,.5,2.75,1.25],results=order.map(t=>source({...c,time:t,frame:t*24}));assert.deepEqual(results[0],results[3]);assert.deepEqual(results[1],results[5]);
});
test('invalid and unresolved numeric domains fail explicitly, with degenerate policies',()=>{
 const bad=[()=>m.sampleMotion2D(()=>[0,0],c,{stepSeconds:0}),()=>m.sampleMotion2D(()=>[0,0],{...c,time:1e30}),()=>m.orbitMotion2D({center:[0,0],radius:[1,1],frequency:1e30})(c),()=>m.springMotion2D({from:[0,0],to:[1,1],stiffness:-1}),()=>m.staggerMotion2D(()=>[0,0],{index:-1,delaySeconds:1}),()=>m.constrainDistance2D([0,0],{center:[0,0],min:1,max:2,coincident:'error'}),()=>m.constrainLine2D([1,1],{from:[0,0],to:[0,0],degenerate:'error'}),()=>m.constrainHalfPlane2D([0,0],{origin:[0,0],normal:[0,0]}),()=>m.snapGrid2D([0,0],{step:[0,1]}),()=>m.wrapPosition2D([0,0],{min:[0,0],max:[0,1]}),()=>m.leadTarget2D([0,0],[1,1],[1,1],{speed:0}),()=>m.orientMotion2D({velocity:[0,0]},{stationary:'error'}),()=>m.blendMotion2D(()=>[0,0],()=>[1,1],2)(c)];for(const fn of bad)assert.throws(fn);
 assert.equal(m.constrainLine2D([1,1],{from:[0,0],to:[0,0]}).status,'degenerate-rest');
});
