import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createFeedbackParticles,particleAcceleration} from '../modules/spatial-effects/src/simulation.ts';

import type {FeedbackParticleOptions} from '../modules/spatial-effects/src/types.ts';
import type {FrameContext} from '../src/core/types.ts';
const ctx=(frame:number,fps=10):FrameContext=>({frame,time:frame/fps,globalFrame:frame,globalTime:frame/fps,dt:1/fps,fps:{num:fps,den:1},durationInFrames:101,progress:frame/100,seed:51});
const options=(more:Partial<FeedbackParticleOptions>={}):FeedbackParticleOptions=>({fps:10,rate:1,duration:.01,lifetime:20,seed:51,origin:[0,0,0],velocity:[1,0,0],substeps:1,...more});
const close=(a:number,b:number,tol=1e-9)=>assert.ok(Math.abs(a-b)<=tol,`${a} != ${b}`);
test('feedback particles integrate acceleration/drag at fixed dt, never wall-clock/request dt',()=>{
  const sim=createFeedbackParticles(options({forces:[{kind:'acceleration',value:[0,-2,0]}]}));
  const p=sim.sample({...ctx(10),dt:17}).particles[0];close(p.position[0],1);close(p.position[1],-1.1);close(p.velocity[1],-2);
  assert.deepEqual(p,sim.sample(ctx(10)).particles[0]);
  const drag=createFeedbackParticles(options({forces:[{kind:'drag',coefficient:2}]}));close(drag.sample(ctx(2)).particles[0].velocity[0],.64);
  close(particleAcceleration([1,0,0],[0,0,0],[{kind:'vortex',axis:[0,0,1],center:[0,0,0],strength:2,softening:1}])[1],Math.SQRT2,1e-15);
  close(particleAcceleration([1,0,0],[0,0,0],[{kind:'attractor',center:[0,0,0],strength:2,softening:1}])[0],-1/Math.SQRT2);
});
test('swept plane/sphere collisions prevent fast-particle tunnelling and produce actual contacts',()=>{
  const plane=createFeedbackParticles(options({origin:[0,1,0],velocity:[2,-20,0],radius:.1,colliders:[{kind:'plane',id:'floor',normal:[0,4,0],offset:0,restitution:.5,friction:.5}]})).sample(ctx(1));
  assert.equal(plane.contacts.length,1);close(plane.particles[0].velocity[1],10);close(plane.particles[0].velocity[0],1);assert.ok(plane.particles[0].position[1]>.1);
  close(plane.contacts[0].time,.045);assert.equal(plane.contacts[0].colliderId,'floor');
  const sphere=createFeedbackParticles(options({origin:[-2,0,0],velocity:[40,0,0],radius:.1,colliders:[{kind:'sphere',id:'ball',center:[0,0,0],radius:.5,restitution:1}]})).sample(ctx(1));
  assert.equal(sphere.contacts.length,1);assert.equal(sphere.particles[0].velocity[0],-40);assert.ok(sphere.particles[0].position[0]<-.6);
  const penetrating=createFeedbackParticles(options({origin:[0,0,0],velocity:[0,0,0],radius:.1,colliders:[{kind:'sphere',id:'ball',center:[0,0,0],radius:.5}]})).sample(ctx(1));assert.ok(penetrating.particles[0].position[0]>=.6);
});
test('random seeks, checkpoint eviction, duplicate frames, trails and fresh replay match exactly',()=>{
  const o=options({rate:15,duration:4,lifetime:2,positionJitter:[.5,.2,.1],velocityJitter:[1,2,.3],substeps:3,trailPoints:7,trailEverySteps:2,forces:[{kind:'vortex',axis:[0,0,5],center:[0,0,0],strength:.5},{kind:'drag',coefficient:.1}],colliders:[{kind:'plane',id:'floor',normal:[0,1,0],offset:-1}],budgets:{checkpointInterval:4,maxCheckpoints:3}}),a=createFeedbackParticles(o),reference=createFeedbackParticles(o),expected=new Map(Array.from({length:101},(_,i)=>[i,reference.sample(ctx(i))]));
  for(const f of [100,0,100,21,80,80,1,44,0,100]){assert.deepEqual(a.sample(ctx(f)),expected.get(f));assert.deepEqual(createFeedbackParticles(o).sample(ctx(f)),expected.get(f));}
  assert.ok(a.checkpointSteps.length<=3);assert.ok(a.sample(ctx(10)).particles.every(p=>p.trail.length<=7));a.reset();assert.deepEqual(a.sample(ctx(100)),expected.get(100));
});
test('configuration and returned snapshots do not alias simulation; fractional substeps and rational fps are explicit',()=>{
  const o=options(),a=createFeedbackParticles(o);o.velocity[0]=100;const p=a.sample(ctx(1));p.particles[0].position[0]=100;close(a.sample(ctx(1)).particles[0].position[0],.1);
  const half=createFeedbackParticles(options({substeps:2}));close(half.sample(ctx(.5)).particles[0].position[0],.05);
  assert.throws(()=>half.sample(ctx(.25)),{code:'E_SPATIAL_TIME'});assert.throws(()=>half.sample({...ctx(1),time:3}),{code:'E_SPATIAL_TIME'});
  const fps={num:30000,den:1001},r=createFeedbackParticles(options({fps,substeps:2}));close(r.sample({...ctx(1),fps,time:1001/30000}).particles[0].position[0],1001/30000);
});
test('safety budgets are configurable beyond 4096 particles; invalid values and failed seeks are explicit',()=>{
  const many=createFeedbackParticles(options({rate:5000,duration:1,lifetime:2,trailPoints:0,budgets:{maxParticles:6000,maxCheckpoints:2,maxValueBytes:64*1024*1024}}));assert.equal(many.sample(ctx(9)).particles.length,4501);
  assert.throws(()=>createFeedbackParticles(options({rate:NaN})),{code:'E_SPATIAL_PARAMETER'});
  assert.throws(()=>createFeedbackParticles(options({colliders:[{kind:'plane',id:'bad',normal:[0,0,0],offset:0}]})),{code:'E_SPATIAL_PARAMETER'});
  assert.throws(()=>createFeedbackParticles(options({trailPoints:1000,budgets:{maxValueBytes:100}})),{code:'E_SPATIAL_STATE_BUDGET'});
  const sim=createFeedbackParticles(options({budgets:{maxReplaySteps:2}}));assert.throws(()=>sim.sample(ctx(10)),{code:'E_SIMULATION_LIMIT'});assert.throws(()=>sim.sample(ctx(1)),{code:'E_SPATIAL_SIMULATION_FAILED'});sim.reset();assert.equal(sim.sample(ctx(1)).step,1);
});
test('collision/spawn budget failures stop an instance; force API validates normalized axes and finite data',()=>{
  const sim=createFeedbackParticles(options({budgets:{maxImpactsPerStep:1},colliders:[{kind:'plane',id:'right',normal:[1,0,0],offset:1},{kind:'plane',id:'left',normal:[-1,0,0],offset:1}]}));
  assert.throws(()=>sim.sample(ctx(1)),{code:'E_SPATIAL_COLLISION_BUDGET'});assert.throws(()=>sim.sample(ctx(0)),{code:'E_SPATIAL_SIMULATION_FAILED'});sim.reset();assert.equal(sim.sample(ctx(0)).step,0);
  const spawn=createFeedbackParticles(options({rate:100,duration:1,budgets:{maxParticles:2}}));assert.throws(()=>spawn.sample(ctx(1)),{code:'E_SPATIAL_STATE_BUDGET'});
  assert.deepEqual(particleAcceleration([1,0,0],[0,0,0],[{kind:'vortex',center:[0,0,0],axis:[0,0,2],strength:1}]),particleAcceleration([1,0,0],[0,0,0],[{kind:'vortex',center:[0,0,0],axis:[0,0,1],strength:1}]));
  assert.throws(()=>particleAcceleration([0,0,0],[0,0,0],[{kind:'drag',coefficient:-1}]),{code:'E_SPATIAL_PARAMETER'});
});
