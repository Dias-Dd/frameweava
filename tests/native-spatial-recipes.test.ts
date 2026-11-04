import {test} from 'node:test';import assert from 'node:assert/strict';
import {NativeRecordingScope} from '../modules/native-gpu/scope.ts';
import {orbitalWorld,crystalSanctum,emberPlume,causticLagoon} from '../modules/spatial-vfx/native.ts';
import {keyframes} from '../src/core/animation.ts';
import type {GpuPixelScope,GpuPixelImage} from '../modules/gpu-effects/pixel-types.ts';
const recipes=[orbitalWorld,crystalSanctum,emberPlume,causticLagoon];
const context=(frame:number):any=>({frame,time:frame/24,fps:{num:24,den:1},globalFrame:frame,globalTime:frame/24,seed:7,dt:1/24,durationInFrames:24,progress:frame/23});
const options={width:96,height:64,steps:32};
async function record(recipe:typeof recipes[number],frame=12,extra:Record<string,unknown>={}){const scope=new NativeRecordingScope();scope.sealInitialization();scope.beginFrame();const image=await recipe(scope.api,context(frame),{...options,...extra});scope.publish(image);return {scope,packet:scope.packet(),image};}
test('four Native recipes record full resident multipass pipelines, F32 linear PM and one caller-owned result',async()=>{
 for(const recipe of recipes){const {scope,packet,image}=await record(recipe);assert.ok(packet.passes.length>=3);assert.ok(packet.kernels.length>=3);assert.equal(packet.images[packet.output].format,'rgba32float');assert.equal(image.info.color.transfer,'linear');assert.equal(image.info.alpha,'premultiplied');assert.equal(scope.api.stats().uploads,0);assert.equal(scope.api.stats().readbacks,0);await scope.api.release(image);await assert.rejects(scope.api.release(image));await scope.api.dispose();}
});
test('same-frame repeat and new Scope replay preserve packets and do not advance logical time',async()=>{
 for(const recipe of recipes){const {scope,packet,image}=await record(recipe,23);await scope.api.release(image);scope.beginFrame();const again=await recipe(scope.api,context(23),options);scope.publish(again);const next=scope.packet();assert.deepEqual(next.parameters,packet.parameters);assert.deepEqual(next.passes,packet.passes);assert.deepEqual(next.images,packet.images);const fresh=await record(recipe,23);assert.deepEqual(fresh.packet,packet);await scope.api.dispose();await fresh.scope.api.dispose();}
});
test('keyframed time and effect parameters use existing Signal evaluation',async()=>{
 const time=keyframes([{frame:0,value:0},{frame:23,value:2}]),{scope,packet}=await record(orbitalWorld,23,{time});
 // Native packet parameters contain exact uniform words, not a new time runner.
 assert.ok(packet.parameters.length>0);const expected=new Uint32Array(Float32Array.of(2).buffer)[0];assert.ok(packet.parameters.some(p=>p.includes(expected)));await scope.api.dispose();
});
test('camera/layout overrides and translucent canonical Glow are refused explicitly',async()=>{
 const scope=new NativeRecordingScope();scope.sealInitialization();scope.beginFrame();
 for(const bad of [{width:0},{height:1.5},{unknown:true},{planet:{camera:{}}},{trails:{occluderRadius:0}}])await assert.rejects(orbitalWorld(scope.api,context(0),{...options,...bad} as any));
 await assert.rejects(crystalSanctum(scope.api,context(0),{...options,crystal:{opacity:.5}}),(e:any)=>e.code==='E_SPATIAL_RECIPE_PARAMETER');assert.equal(scope.api.stats().runs,0);await scope.api.dispose();
});
test('cancellation and work-budget rejection do not leave a candidate output',async()=>{
 for(const extra of [{signal:AbortSignal.abort()},{maxWork:1}]){const scope=new NativeRecordingScope();scope.sealInitialization();scope.beginFrame();await assert.rejects(orbitalWorld(scope.api,context(0),{...options,...extra}));assert.throws(()=>scope.packet());assert.equal(scope.api.stats().runs,0);await scope.api.dispose();}
});
test('mid-recipe failure releases every intermediate image, preserves primary error and borrowed Scope',async()=>{
 const scope=new NativeRecordingScope();scope.sealInitialization();scope.beginFrame();let calls=0;const live=new Set<GpuPixelImage>();
 const gpu={...scope.api,async run(...args:Parameters<GpuPixelScope['run']>){if(++calls===3)throw Object.assign(new Error('injected backend failure'),{code:'E_TEST_BACKEND'});const image=await scope.api.run(...args);live.add(image);return image;},async release(image:GpuPixelImage){assert.ok(live.delete(image));return scope.api.release(image);}};
 await assert.rejects(orbitalWorld(gpu,context(0),options),(e:any)=>e.code==='E_TEST_BACKEND');assert.equal(live.size,0);assert.equal(scope.api.stats().disposed,false);await scope.api.dispose();
});
test('explicit disabled components leave the intended actual shader, not a black placeholder',async()=>{
 for(const [recipe,extra]of [[orbitalWorld,{stars:false,trails:false}],[crystalSanctum,{stars:false,glow:false}],[causticLagoon,{fog:false,beam:false}]] as const){const {scope,packet}=await record(recipe as any,12,extra);assert.equal(packet.passes.length,1);assert.ok(packet.kernels[0].code.includes('sv_ink'));await scope.api.dispose();}
});
