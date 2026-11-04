import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
import {createImageEmitter} from '../modules/spatial-effects/src/image-emitter.ts';import {prepareBirthPlan} from '../modules/spatial-effects/src/bursts.ts';import {createFeedbackParticles} from '../modules/spatial-effects/src/simulation.ts';
import {surfaceFromPixels,linear709,srgb,type AlphaMode,type PixelFormat} from '../src/media/surface.ts';import type {FrameContext} from '../src/core/types.ts';import type {FeedbackParticleOptions} from '../modules/spatial-effects/src/types.ts';
import {createFeedbackParticles as legacy} from '../modules/spatial-effects/validation/frozen-0.3.0/simulation.mjs';
const ctx=(frame:number):FrameContext=>({frame,time:frame/10,globalFrame:frame,globalTime:frame/10,dt:.1,fps:{num:10,den:1},durationInFrames:101,progress:frame/100,seed:31});
const base:FeedbackParticleOptions={fps:10,rate:0,lifetime:3,substeps:2,origin:[0,0,0],velocity:[1,0,0],radius:.1,trailPoints:4,seed:51};
const options={id:'image',bounds:{left:-2,right:2,bottom:-1,top:1}};
function source(alpha:AlphaMode='straight',format:PixelFormat='rgba32float'){const values=[-2,4,.5,.5,0,0,0,0,1,2,3,1,4,-1,2,.25];return surfaceFromPixels(2,2,Float32Array.from(values,(v,i)=>alpha==='premultiplied'&&i%4!==3?v*values[i-i%4+3]:v),{format,color:linear709,alpha});}
test('image alpha distribution, inherited HDR/alpha, top-left meter mapping and independent sample values',()=>{
 const e=createImageEmitter(source(),{...options,sampling:'center',inherit:'color-alpha'}),counts=[0,0,0];for(let i=0;i<14000;i++){const s=e.sample(91,i);assert.equal(s.position[2],0);let j;if(s.position[1]===.5){assert.equal(s.position[0],-1);assert.deepEqual(s.ink,[-2,4,.5]);assert.equal(s.opacity,.5);j=0;}else if(s.position[0]===-1){assert.deepEqual(s.ink,[1,2,3]);assert.equal(s.opacity,1);j=1;}else{assert.deepEqual(s.position,[1,-.5,0]);assert.deepEqual(s.ink,[4,-1,2]);assert.equal(s.opacity,.25);j=2;}counts[j]++;}
 for(const [i,p]of [.5/1.75,1/1.75,.25/1.75].entries())assert.ok(Math.abs(counts[i]-14000*p)<7*Math.sqrt(14000*p*(1-p)));
 const p=e.sample(91,1);p.position[0]=999;p.ink![0]=999;assert.notEqual(e.sample(91,1).position[0],999);assert.notEqual(e.sample(91,1).ink![0],999);e.dispose();assert.equal(e.diagnostics().disposed,true);assert.throws(()=>e.sample(1,0),{code:'E_SPATIAL_EMITTER_DISPOSED'});
});
test('straight/premultiplied and float16/32 have identical selected sampling, uniform/threshold policies explicit',()=>{
 const a=createImageEmitter(source(),options),reference=Array.from({length:100},(_,i)=>a.sample(12,i));for(const alpha of ['straight','premultiplied'] as const)for(const format of ['rgba16float','rgba32float'] as const){const e=createImageEmitter(source(alpha,format),options);assert.deepEqual(Array.from({length:100},(_,i)=>e.sample(12,i)),reference);e.dispose();}
 const e=createImageEmitter(source(),{...options,threshold:1,sampling:'pixel-area',weight:'uniform',inherit:'none'});for(let i=0;i<500;i++){const s=e.sample(3,i);assert.ok(s.position[0]>=-2&&s.position[0]<0&&s.position[1]>-1&&s.position[1]<=0);assert.equal(s.ink,undefined);}e.dispose();a.dispose();
});
test('empty, color mismatch, precision loss, invalid policy and decode budgets fail explicitly',()=>{
 assert.throws(()=>createImageEmitter(surfaceFromPixels(1,1,[1,0,0,0],{format:'rgba32float',color:linear709}),options),{code:'E_SPATIAL_EMITTER_EMPTY'});
 assert.throws(()=>createImageEmitter({...source(),color:srgb},options),{code:'E_SPATIAL_COLOR'});assert.ok(createImageEmitter({...source(),color:srgb},{...options,inherit:'none'}));
 const tiny=surfaceFromPixels(2,1,[0,0,0,1,0,0,0,1e-30],{format:'rgba32float',color:linear709});assert.throws(()=>createImageEmitter(tiny,options),{code:'E_SPATIAL_EMITTER_PRECISION'});
 for(const change of [{maxSourcePixels:1},{maxValueBytes:1}])assert.throws(()=>createImageEmitter(source(),{...options,...change}),{code:'E_SPATIAL_EMITTER_BUDGET'});
 for(const change of [{threshold:2},{weight:'bad'},{sampling:'bad'},{inherit:'bad'},{bounds:{left:1,right:0,bottom:0,top:1}}])assert.throws(()=>createImageEmitter(source(),{...options,...change} as any),{code:'E_SPATIAL_PARAMETER'});
});
test('merged rate and burst plan matches independent explicit event ordering, partial intervals and lifetimes',()=>{
 const bursts=[{time:0,count:2},{time:.25,count:3},{time:.5,count:2},{time:.5,count:1},{time:1,count:4}],events:{time:number;order:number;local:number}[]=[];for(let i=0;i<5;i++)events.push({time:.25+i/4,order:-1,local:i});for(let i=0;i<bursts.length;i++)for(let j=0;j<bursts[i].count;j++)events.push({time:bursts[i].time,order:i,local:j});events.sort((a,b)=>a.time-b.time||a.order-b.order||a.local-b.local);
 const s=createFeedbackParticles({...base,rate:4,startTime:.25,duration:1.25,lifetime:.6,bursts});for(let frame=0;frame<=25;frame++){const time=frame/10,result=s.sample(ctx(frame)),expected=events.flatMap((e,id)=>e.time<=time&&time-e.time<.6?[{id,time:e.time}]:[]);assert.deepEqual(result.particles.map(p=>({id:p.id,time:p.birthTime})),expected);assert.equal(result.emitted,events.filter(e=>e.time<=time).length);for(const p of result.particles)assert.ok(Math.abs(p.position[0]-(time-p.birthTime))<1e-12);}
 assert.throws(()=>prepareBirthPlan(0,0,1,1,[{time:0,count:Number.MAX_SAFE_INTEGER},{time:1,count:1}]),{code:'E_SPATIAL_STATE_BUDGET'});
});
test('image-feedback force/collision/trail state survives 100→0→100, repeated frames, new source and checkpoint eviction',()=>{
 const make=()=>{const emitter=createImageEmitter(source(),options),sim=createFeedbackParticles({...base,rate:4,duration:2,bursts:[{time:0,count:20},{time:.37,count:4},{time:2,count:7}],lifetime:8,velocityJitter:[1,2,.2],forces:[{kind:'acceleration',value:[0,-1,0]}],colliders:[{kind:'plane',id:'floor',normal:[0,1,0],offset:-2}],budgets:{maxCheckpoints:3,checkpointInterval:4}},{emitter});return {emitter,sim};},a=make(),b=make(),expected=new Map([0,3,10,70,100].map(f=>[f,b.sim.sample(ctx(f))]));
 for(const f of [100,0,100,3,70,70,10,100])assert.deepEqual(a.sim.sample(ctx(f)),expected.get(f));const fresh=make();assert.deepEqual(fresh.sim.sample(ctx(70)),expected.get(70));a.sim.reset();assert.deepEqual(a.sim.sample(ctx(100)),expected.get(100));assert.ok(a.sim.checkpointSteps.length<=3);assert.ok(expected.get(10)!.particles.every(p=>p.ink&&p.opacity!==undefined&&p.trail.length));a.emitter.dispose();assert.throws(()=>a.sim.sample(ctx(100)),{code:'E_SPATIAL_EMITTER_DISPOSED'});b.emitter.dispose();fresh.emitter.dispose();
});
test('burst budget and async borrowed source fail without partial state and preserve source ownership',()=>{
 assert.throws(()=>createFeedbackParticles({...base,bursts:[{time:0,count:4}],budgets:{maxParticles:3}}).sample(ctx(0)),{code:'E_SPATIAL_STATE_BUDGET'});
 assert.throws(()=>createFeedbackParticles({...base,bursts:[{time:0,count:1}]},{emitter:{identity:'bad',check(){},sample:()=>Promise.resolve({position:[0,0,0]})} as any}).sample(ctx(0)),{code:'E_SPATIAL_EMITTER_ASYNC'});
 const e=createImageEmitter(source(),options),a=createFeedbackParticles({...base,bursts:[{time:0,count:1}]},{emitter:e}),b=createFeedbackParticles({...base,bursts:[{time:0,count:1}]},{emitter:e});assert.deepEqual(a.sample(ctx(0)),b.sample(ctx(0)));a.reset();assert.ok(b.sample(ctx(1)).particles.length);e.dispose();
});
test('legacy 0.3.0 feedback JSON remains exact when image/bursts are not selected',async()=>{
 const receipt=JSON.parse(await readFile('modules/spatial-effects/validation/frozen-0.3.0/receipt.json','utf8'));assert.equal(createHash('sha256').update(await readFile('modules/spatial-effects/validation/frozen-0.3.0/simulation.mjs')).digest('hex'),receipt.output);
 for(const changes of [{rate:0},{rate:4,duration:1},{rate:8,duration:2,lifetime:.5},{rate:5,positionJitter:[.2,.3,.4]},{rate:1,forces:[{kind:'drag',coefficient:.2}]},{rate:2,colliders:[{kind:'plane',id:'floor',normal:[0,1,0],offset:-1}]}]){const options={...base,...changes} as FeedbackParticleOptions,a=createFeedbackParticles(options),b=legacy(options);for(const f of [100,0,100,3,12,70,12])assert.equal(JSON.stringify(a.sample(ctx(f))),JSON.stringify(b.sample(ctx(f))));}
});
