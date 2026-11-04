import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {createInertia} from '../modules/pro-animation/src/inertia.ts';
import {spring,springAt} from '../src/core/animation.ts';
import type {FrameContext} from '../src/core/types.ts';
const context=(time:number,fps={num:12,den:1},start=0):FrameContext=>({frame:time*fps.num/fps.den+start,time,globalFrame:99,globalTime:99,dt:fps.den/fps.num,progress:.75,fps,durationInFrames:12,seed:17});
const close=(a:number,b:number,budget=1e-10)=>assert.ok(Math.abs(a-b)<=budget,`${a} vs ${b}; budget ${budget}`);
const base=resolve('modules/pro-animation/validation/inertia-reference');

test('exponential decay agrees with frozen original Motion and independently evaluated 80-digit Decimal',async()=>{
 const file=resolve(base,'motion-reference.mjs'),bytes=await readFile(file);assert.equal(createHash('sha256').update(bytes).digest('hex'),'d2aeefe365a2b585dc03ecbf5959d70685f85bc998fe1f41ef638e6a3ef5aee9');
 const {inertia}=await import(pathToFileURL(file).href),reference=JSON.parse(await readFile(resolve(base,'decimal-reference.json'),'utf8'));
 for(const row of reference.cases){
  const sampler=createInertia({from:row.origin,velocity:row.velocity,timeConstantSeconds:row.tau}),actual=sampler.sample(context(row.time));
  close(actual.value,Number(row.value),Math.max(1e-10,Math.abs(Number(row.value))*3e-16));close(actual.velocity,Number(row.speed),1e-10);
  // Motion's `power` is amplitude/velocity; mapping to tau makes its input derivative equal our true v0.
  const upstream=inertia({keyframes:[row.origin],velocity:row.velocity,power:row.tau,timeConstant:row.tau*1000,restDelta:0});
  close(upstream.next(row.time*1000).value,actual.value,Math.max(1e-10,Math.abs(actual.value)*3e-16));
  if(row.boundary!==undefined){const bounded=createInertia({from:row.origin,velocity:row.velocity,timeConstantSeconds:row.tau,bounds:row.velocity>0?{max:row.boundary}:{min:row.boundary}});close(bounded.handoff!.elapsedSeconds,Number(row.crossing),1e-15);close(bounded.handoff!.velocity,Number(row.crossingVelocity),1e-10);}
 }
});

test('Stage-local rational/fractional frames preserve Core context and exact start/pre-start semantics',()=>{
 const sampler=createInertia({from:12,velocity:500,timeConstantSeconds:.2,startFrame:7.25}),fps={num:30000,den:1001},c=context(.125,fps,7.25),saved=structuredClone(c);
 close(sampler.valueAt(c),12+100*(1-Math.exp(-.125/.2)));assert.deepEqual(c,saved);
 assert.deepEqual(sampler.sample(context(0,fps,7.25)),{value:12,velocity:500,elapsedSeconds:0,phase:'decay'});
 const held=sampler.sample(context(-.1,fps,7.25));assert.equal(held.value,12);assert.equal(held.velocity,0);assert.equal(held.phase,'hold');
 const stopped=createInertia({from:-23,velocity:0});assert.equal(stopped.sample(context(100)).phase,'constant');assert.equal(stopped.freeTarget,-23);
 assert.equal(stopped.valueAt(context(1e12)),-23);
});

test('analytic crossing is continuous in both position and velocity; boundary targets are asymptotic, not falsely crossed',()=>{
 for(const sign of [1,-1]){
  const sampler=createInertia({from:0,velocity:1000*sign,timeConstantSeconds:.25,bounds:sign>0?{max:100}:{min:-100}}),h=sampler.handoff!;
  close(h.elapsedSeconds,-.25*Math.log(.6),1e-15);close(h.velocity,600*sign);assert.equal(h.reason,'crossing');
  const eps=1e-9,left=sampler.sample(context(h.elapsedSeconds-eps)),right=sampler.sample(context(h.elapsedSeconds+eps));close(left.value,right.value,2e-6);close(left.velocity,right.velocity,2e-5);
  close(sampler.valueAt(context(h.elapsedSeconds)),100*sign,1e-10);close(sampler.velocityAt(context(h.elapsedSeconds)),600*sign,1e-9);
 }
 assert.equal(createInertia({from:0,velocity:400,timeConstantSeconds:.25,bounds:{max:100}}).handoff,undefined);
 assert.equal(createInertia({from:0,velocity:100,timeConstantSeconds:.25,bounds:{min:-1,max:100}}).handoff,undefined);
 const at=createInertia({from:100,velocity:10,bounds:{max:100}});assert.equal(at.handoff!.elapsedSeconds,0);assert.equal(at.valueAt(context(0)),100);assert.equal(at.velocityAt(context(0)),10);
 const point=createInertia({from:3,velocity:-10,bounds:{min:3,max:3}});assert.equal(point.handoff!.side,'min');assert.equal(point.valueAt(context(0)),3);
 const outside=createInertia({from:140,velocity:-80,bounds:{max:100}});assert.equal(outside.handoff!.reason,'initial-outside');assert.equal(outside.valueAt(context(0)),140);assert.equal(outside.velocityAt(context(0)),-80);
 const late=createInertia({from:0,velocity:1,timeConstantSeconds:1,bounds:{max:1-Number.EPSILON/2}});close(late.handoff!.elapsedSeconds,-Math.log(Number.EPSILON/2),1e-13);assert.equal(late.handoff!.velocity,Number.EPSILON/2);
 const early=createInertia({from:0,velocity:1e12,timeConstantSeconds:1,bounds:{max:1}});close(early.handoff!.elapsedSeconds,-Math.log1p(-1e-12),1e-25);
 // A soft spring anchor is deliberately not hard containment or multi-wall collision physics.
 assert.ok(at.valueAt(context(.01))>100);
});

// Independent ODE reference, TEST ONLY. No runtime simulation/checkpoints/seek semantics are introduced.
function rk4(x:number,v:number,time:number,k:number,c:number,m:number){
 const count=Math.ceil(time/.0001),h=time/count,derivative=(a:number,b:number)=>[b,(-k*a-c*b)/m];
 for(let i=0;i<count;i++){const a=derivative(x,v),b=derivative(x+h*a[0]/2,v+h*a[1]/2),d=derivative(x+h*b[0]/2,v+h*b[1]/2),e=derivative(x+h*d[0],v+h*d[1]);x+=h*(a[0]+2*b[0]+2*d[0]+e[0])/6;v+=h*(a[1]+2*b[1]+2*d[1]+e[1])/6;}return {x,v};
}
test('bounded position and derivative reuse Core Spring for under/critical/overdamped responses and agree with independent RK4',()=>{
 for(const c of [5,20,35])for(const time of [.013,.2,.8,2]){
  const sampler=createInertia({from:140,velocity:-80,bounds:{max:100,spring:{stiffness:100,damping:c,mass:1}}}),at=context(time),expected=rk4(40,-80,time,100,c,1);
  close(sampler.valueAt(at),100+expected.x,1e-8);close(sampler.velocityAt(at),expected.v,1e-8);
  close(sampler.valueAt(at),springAt(spring({from:140,to:100,velocity:-80,stiffness:100,damping:c}),at),0);
  const h=1e-5;close(sampler.velocityAt(at),(sampler.valueAt(context(time+h))-sampler.valueAt(context(time-h)))/(2*h),1e-5);
 }
 // Core's narrow critical band intentionally uses exactly critical damping; the derivative follows that contract.
 const near=createInertia({from:140,velocity:-80,bounds:{max:100,spring:{stiffness:100,damping:20*(1+5e-9)}}});close(near.velocityAt(context(.2)),rk4(40,-80,.2,100,20,1).v,1e-8);
});

test('absolute-frame queries are order-independent and constructor inputs/metadata cannot alter the frozen response',()=>{
 const options={from:0,velocity:1000,timeConstantSeconds:.25,bounds:{max:100,spring:{stiffness:170,damping:15,mass:1}}},sampler=createInertia(options),times=[0,.05,.5,1.25,10,.1,100],seen=new Map(times.map(t=>[t,sampler.sample(context(t))]));
 options.velocity=-100;options.bounds.max=99;options.bounds.spring.stiffness=2;
 for(const t of [10,0,100,1.25,.05,.1,.5,0])assert.deepEqual(sampler.sample(context(t)),seen.get(t));
 assert.ok(Object.isFrozen(sampler));assert.ok(Object.isFrozen(sampler.handoff));assert.equal(sampler.freeTarget,250);
 assert.deepEqual(sampler.sample(context(1e100)),{value:100,velocity:0,elapsedSeconds:1e100,phase:'spring'});
});

test('actual original Motion bounded generator is history-dependent; adapter does not preserve its sampled boundary event',async()=>{
 const {inertia}=await import(pathToFileURL(resolve(base,'motion-reference.mjs')).href),settings={keyframes:[0],velocity:1000,power:.25,timeConstant:250,max:100,bounceStiffness:170,bounceDamping:26,restDelta:0,restSpeed:0};
 const direct=inertia(settings).next(500).value,stepped=inertia(settings);for(const t of [0,100,200,300,400])stepped.next(t);const sequential=stepped.next(500).value;
 assert.ok(Math.abs(direct-sequential)>100,'Characterize the pinned upstream, not a substitute mock');
 const sampler=createInertia({from:0,velocity:1000,timeConstantSeconds:.25,bounds:{max:100}}),value=sampler.valueAt(context(.5));for(const t of [0,.1,.2,.3,.4])sampler.valueAt(context(t));assert.equal(sampler.valueAt(context(.5)),value);
});

test('invalid/nonfinite parameters, unknown fields and unresolved floating modes diagnose explicitly without arbitrary time caps',()=>{
 for(const bad of [null,[],{}, {from:0,velocity:Infinity},{from:NaN,velocity:1},{from:0,velocity:1,timeConstantSeconds:0},{from:0,velocity:1,startFrame:NaN},{from:0,velocity:1,power:.8},{from:0,velocity:1,bounds:{}},{from:0,velocity:1,bounds:{min:2,max:1}},{from:0,velocity:1,bounds:{max:NaN}},{from:0,velocity:1,bounds:{max:2,typo:1}},{from:0,velocity:1e308,timeConstantSeconds:2}])assert.throws(()=>createInertia(bad as any),{code:'E_PA_INERTIA'});
 assert.throws(()=>createInertia({from:0,velocity:1,bounds:{max:0,spring:{mass:0}}}),{code:'E_SPRING'});
 assert.throws(()=>createInertia({from:0,velocity:1,bounds:{max:0,spring:{damping:1e30}}}),{code:'E_PA_INERTIA'});
 assert.throws(()=>createInertia({from:0,velocity:1,bounds:{max:0,spring:{stiffness:1e308,mass:1e308,damping:1e308}}}),{code:'E_PA_INERTIA'});
 assert.throws(()=>createInertia({from:0,velocity:1,bounds:{max:0,spring:{stiffness:1e-300,mass:1e-300,damping:0}}}),{code:'E_PA_INERTIA'});
 const sampler=createInertia({from:0,velocity:1});assert.throws(()=>sampler.valueAt(context(NaN)),{code:'E_PA_INERTIA'});assert.throws(()=>sampler.valueAt({...context(0),fps:{num:0,den:1}}),{code:'E_TIME'});
 const forever=createInertia({from:0,velocity:10,bounds:{max:0,spring:{stiffness:100,damping:0}}});assert.ok(Number.isFinite(forever.valueAt(context(1e8))));assert.throws(()=>forever.valueAt(context(1e20)),{code:'E_PA_INERTIA'});
});
