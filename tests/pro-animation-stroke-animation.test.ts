import test from 'node:test';
import assert from 'node:assert/strict';
import type {FrameContext} from '../src/core/types.ts';
import {keyframes} from '../src/core/animation.ts';
import * as stroke from '../modules/pro-animation/src/stroke-animation/index.ts';
import {inkAt} from '../modules/pro-animation/src/stroke-animation/profiles.ts';
import * as graphics from '../modules/graphics-contracts/index.ts';
import {createCurveSampler} from '../modules/pro-animation/src/curve-sampler.ts';
import {operations} from './helpers/pa3-pathops.ts';
import {directCurveFactory,curvePath} from './helpers/pa3-curve.ts';
const c:FrameContext={frame:12,time:.5,globalFrame:12,globalTime:.5,dt:1/24,fps:{num:24,den:1},durationInFrames:25,progress:.5,seed:37};
const near=(a:number,b:number,tol=1e-10)=>assert.ok(Math.abs(a-b)<=tol,JSON.stringify({a,b,tol}));
const line:stroke.StrokeCenterline={coordinates:{spaceId:'canvas',unit:'px',origin:'top-left',x:'right',y:'down',width:240,height:120},closed:false,length:100,points:[{x:20,y:60,distance:0},{x:120,y:60,distance:100}]};
const area=(mesh:stroke.PreparedStrokeMesh)=>{let a=0;const p=mesh.positions;for(let i=0;i<p.length;i+=9)a+=Math.abs((p[i+3]-p[i])*(p[i+7]-p[i+1])-(p[i+4]-p[i+1])*(p[i+6]-p[i]))/2;return a;};
test('23 named creation functions, no lifecycle methods counted',()=>{assert.equal(Object.keys(stroke).filter(k=>typeof Reflect.get(stroke,k)==='function').length,23);});
test('width ramps, knots, envelope, taper, wave and Core Signals have physical reference values',()=>{
 assert.equal(stroke.constantStrokeWidth(12)(.8,c),12);assert.equal(stroke.rampStrokeWidth(4,20)(.25,c),8);assert.equal(stroke.knotStrokeWidth([{at:0,width:4},{at:.5,width:20},{at:1,width:8}])(.75,c),14);near(stroke.bellStrokeWidth(20,{floor:4})(.5,c),20);assert.equal(stroke.taperStrokeWidth(stroke.constantStrokeWidth(20),{start:.2,end:.2})(.1,c),10);near(stroke.waveStrokeWidth(stroke.constantStrokeWidth(10),{amplitude:.5})(.25,c),15);
 const signal=keyframes([{frame:0,value:4},{frame:24,value:20}]);assert.equal(stroke.constantStrokeWidth(signal)(0,c),12);assert.throws(()=>stroke.taperStrokeWidth(stroke.constantStrokeWidth(1),{start:.8,end:.8}),{code:'E_PA_STROKE_PARAMETER'});
});
test('profile arithmetic, clamping, remapping and random time access compose without a new clock',()=>{
 const p=stroke.clampStrokeWidth(stroke.addStrokeWidths(stroke.rampStrokeWidth(0,10),stroke.constantStrokeWidth(2)),3,8);assert.equal(p(0,c),3);assert.equal(p(1,c),8);assert.equal(stroke.multiplyStrokeWidth(p,stroke.constantStrokeWidth(.5))(.5,c),3.5);assert.equal(stroke.remapStrokeWidth(stroke.rampStrokeWidth(0,10),{start:1,end:0})(.25,c),7.5);
 const n=stroke.noiseStrokeWidth(p,{seed:37,amplitude:.2,frequency:4,speed:2}),contexts=[c,{...c,time:0},c];assert.equal(n(.3,contexts[0]),n(.3,contexts[2]));assert.notEqual(n(.3,contexts[0]),n(.3,contexts[1]));for(const bad of [-.1,1.1,NaN])assert.throws(()=>p(bad,c));assert.throws(()=>stroke.constantStrokeWidth(-1)(0,c));assert.throws(()=>stroke.knotStrokeWidth([{at:0,width:2},{at:0,width:4},{at:1,width:5}]));
});
test('linear HDR gradients interpolate PM, retain signed colors, and never paint transparent RGB fringes',()=>{
 const a=stroke.gradientStrokeInk([{at:0,color:[-2,4,8,0]},{at:1,color:[-2,4,8,1]}]),items=a(c);assert.deepEqual(items[0].color,[0,0,0,0].map((v,i)=>i===0?-0:v));assert.deepEqual(inkAt(items,.25),[-.5,1,2,.25]);const f=stroke.fadeStrokeInk(a,.5)(c);assert.deepEqual(inkAt(f,.5),[-.5,1,2,.25]);assert.deepEqual(stroke.solidStrokeInk([-.5,4,2,.5])(c)[0].color,[-.25,2,1,.5]);
});
test('reverse, continuous mirror/repeat and mixed-knot gradients preserve piecewise reference',()=>{
 const a=stroke.gradientStrokeInk([{at:0,color:[0,0,0,1]},{at:.3,color:[1,2,3,1]},{at:1,color:[2,4,6,1]}]),b=stroke.gradientStrokeInk([{at:0,color:[4,2,0,1]},{at:.7,color:[2,1,0,1]},{at:1,color:[0,0,0,1]}]);
 for(const u of [0,.15,.3,.5,.7,1]){const mixed=inkAt(stroke.mixStrokeInks(a,b,.25)(c),u),x=inkAt(a(c),u),y=inkAt(b(c),u);mixed.forEach((v,i)=>near(v,.75*x[i]+.25*y[i]));inkAt(stroke.reverseStrokeInk(a)(c),u).forEach((v,i)=>near(v,inkAt(a(c),1-u)[i]));}
 const repeated=stroke.repeatStrokeInk(a,{cycles:2})(c);assert.deepEqual(inkAt(repeated,.5),inkAt(a(c),1));assert.deepEqual(inkAt(repeated,1),inkAt(a(c),0));assert.throws(()=>stroke.repeatStrokeInk(a,{cycles:2,mirror:false})(c),/seam/);
});
test('BVH signed path coordinates select nearest segment with stable crossing ties',()=>{
 const q=stroke.createStrokeLocator(line).locate([45,63]);assert.equal(q.distance,25);assert.equal(q.fraction,.25);assert.equal(q.lateral,3);assert.equal(q.separation,3);
 assert.throws(()=>stroke.createStrokeLocator(line).locate([1e200,0]),{code:'E_PA_STROKE_PRECISION'});
 const cross={...line,length:3,points:[{x:0,y:0,distance:0},{x:10,y:10,distance:1},{x:0,y:10,distance:2},{x:10,y:0,distance:3}]};assert.equal(stroke.createStrokeLocator(cross).locate([5,5]).segment,0);
});
test('real kurbo samples feed canonical butt/round/square brush envelopes and Earcut area invariants',async()=>{
 const curve=await createCurveSampler(graphics,directCurveFactory,curvePath([['M',20,60],['L',120,60]],240,120)),ops=await operations();try{
  const sampled=await stroke.sampleStrokePath(curve,{spacing:10});assert.equal(sampled.points.length,11);near(sampled.length,100);
  for(const cap of ['butt','square','round'] as const){const mesh=await stroke.prepareStrokeMesh(sampled,stroke.constantStrokeWidth(20),{pathOperations:ops,context:c,cap}),bounds=stroke.strokeMeshBounds(mesh)!;near(bounds.top,50,.003);near(bounds.bottom,70,.003);if(cap==='butt'){near(area(mesh),2000,.1);near(bounds.left,20,.003);}if(cap==='square')near(area(mesh),2400,.1);if(cap==='round')near(area(mesh),2000+Math.PI*100,2);assert.ok(mesh.preparation.maxAreaDeviation<=1e-10);assert.ok(stroke.hitTestStrokeMesh(mesh,[50,60]));assert.equal(stroke.hitTestStrokeMesh(mesh,[50,85]),false);}
 }finally{assert.equal((await curve.dispose()).remainingSessions,0);assert.equal((await ops.dispose()).remainingSessions,0);}
});
test('variable width trapezoid, zero width, cancellation and negative width have explicit results',async()=>{
 const ops=await operations();try{const mesh=await stroke.prepareStrokeMesh(line,stroke.rampStrokeWidth(10,30),{pathOperations:ops,context:c,cap:'butt'});near(area(mesh),2000,.1);assert.ok(stroke.hitTestStrokeMesh(mesh,[110,72]));assert.equal(stroke.hitTestStrokeMesh(mesh,[25,72]),false);
 const empty=await stroke.prepareStrokeMesh(line,stroke.constantStrokeWidth(0),{pathOperations:ops,context:c});assert.equal(empty.positions.length,0);assert.equal(stroke.strokeMeshBounds(empty),null);await assert.rejects(stroke.prepareStrokeMesh(line,()=>-1,{pathOperations:ops,context:c}));await assert.rejects(stroke.prepareStrokeMesh(line,()=>1,{pathOperations:ops,context:c,signal:AbortSignal.abort()}),{code:'E_RENDER_CANCELLED'});
 }finally{await ops.dispose();}
});
test('closed ring keeps the hole; inconsistent closure and width seams reject',async()=>{
 const loop:stroke.StrokeCenterline={...line,closed:true,length:240,points:[{x:40,y:30,distance:0},{x:100,y:30,distance:60},{x:100,y:90,distance:120},{x:40,y:90,distance:180},{x:40,y:30,distance:240}]},ops=await operations();try{const mesh=await stroke.prepareStrokeMesh(loop,stroke.constantStrokeWidth(10),{pathOperations:ops,context:c});assert.ok(stroke.hitTestStrokeMesh(mesh,[40,60]));assert.equal(stroke.hitTestStrokeMesh(mesh,[70,60]),false);assert.ok(mesh.preparation.faces>0);await assert.rejects(stroke.prepareStrokeMesh(loop,stroke.rampStrokeWidth(2,10),{pathOperations:ops,context:c}),/seam/);assert.throws(()=>stroke.createStrokeLocator({...loop,points:loop.points.slice(0,4)}));}finally{await ops.dispose();}
});
