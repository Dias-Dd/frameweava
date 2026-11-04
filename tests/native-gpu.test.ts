import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {buildProject} from '../src/compiler/build.ts';
import {Renderer} from '../src/render/renderer.ts';
import {NativeGpuClient} from '../modules/native-gpu/client.ts';
import {compileNativePlan} from '../modules/native-gpu/program.ts';
import {nativePixelShader,pixelShader} from '../modules/gpu-effects/pixel-shader.ts';
import {residentSourceKernel} from '../modules/gpu-effects/examples/resident-preview-kernels.ts';
import type {BuiltProject} from '../src/core/types.ts';

// Explicit hardware test entry, never silently skipped. Build diagnostics binary
// first; production binaries deliberately reject inspectForTest.
const executable=resolve(process.env.FRAMEWEAVE_NATIVE_GPU??'.frameweave/native-target/debug/frameweave-native-gpu.exe');
let built:BuiltProject;
test.before(async()=>{process.env.FRAMEWEAVE_HOME=resolve('.frameweave/nh');built=await buildProject(resolve('modules/native-gpu/examples/two-stage.tsx'));});
const f32=(v:number)=>new Uint32Array(new Float32Array([v]).buffer)[0];
function reference(width:number,height:number,frame:number){
 const pixels:number[]=[];
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const a=[0,.125,.5,.875,1][(x+y)%5],v=((13*x+7*y+3*frame)%29-10)*.25;
  pixels.push(...(a===0?[1,-.5,.25,0]:[v*a*.5,(v*.5+1)*a*.5,(2-v*.25)*a*.5,a]));
 }
 return pixels;
}
test('native shader drops numerical flags, legacy Web shader retains exact checks',()=>{
 const native=nativePixelShader(residentSourceKernel),web=pixelShader(residentSourceKernel);
 assert.doesNotMatch(native,/fw_errors|atomicMin|map_async/);
 assert.match(native,/fw_half\(value.r\)/);assert.match(native,/id.x>=d.x/);
 assert.match(web,/fw_errors/);assert.match(web,/atomicMin/);
});
test('native qualification explicitly rejects unsupported or unsafe execution shapes',()=>{
 for(const alter of [
  (b:BuiltProject)=>{b.manifest.stages[0].engine='web';},
  (b:BuiltProject)=>{b.manifest.stages[0].seek='fixed-step';},
  (b:BuiltProject)=>{b.manifest.layers[0].opacity=.5;},
  (b:BuiltProject)=>{b.manifest.stages[0].props.nativePixel={...(b.manifest.stages[0].props.nativePixel as object),kernel:{...residentSourceKernel,abiVersion:2,dataInputs:[]}};},
 ]){
  const b=structuredClone(built);alter(b);
  assert.throws(()=>compileNativePlan(b.manifest,{width:32,height:18}),{code:'E_NATIVE_ELIGIBILITY'});
 }
 assert.throws(()=>compileNativePlan(built.manifest,{width:3840,height:2160,maxBytes:1024}),{code:'E_NATIVE_ELIGIBILITY'});
});
test('real Rust/wgpu two Stage HDR/negative RGB/Alpha and random frames match independent reference',async()=>{
 const plan=compileNativePlan(built.manifest,{width:32,height:18}),client=await NativeGpuClient.create(plan.program,{executable});
 try{
  for(const frame of [0,23,3,23]){
   const ticket=await client.submit(frame,[[frame],[f32(.5)]]);await ticket.completed;
   const {pixels}=await client.inspectForTest(ticket.slot,1);
   assert.deepEqual(pixels,reference(32,18,frame));
   assert.ok(pixels.some((v,i)=>i%4!==3&&v<0));assert.ok(pixels.some((v,i)=>i%4!==3&&v>1));
  }
  const stats=await client.stats();assert.equal(stats.diagnosticReadbacks,4);assert.equal(stats.frameHashes,0);
  await assert.rejects(client.submit(0,[[0],[NaN]]),{code:'E_NATIVE_PARAMETERS'});
 }finally{await client.close();await client.close();}
});
test('Renderer uses the real DAG/time evaluator, two slots, zero Chromium and explicit CPU boundary',async()=>{
 const renderer=await Renderer.create(built,{width:320,height:180,nativeGpu:{executable}});
 try{
  assert.equal('browserStarted' in renderer.status(),false);assert.equal(renderer.status().nativeFrameSlots,2);
  const tickets=await Promise.all([renderer.submitNativeFrame(4),renderer.submitNativeFrame(0),renderer.submitNativeFrame(239)]);
  assert.deepEqual(tickets.map(t=>t.frame),[4,0,239]);assert.notEqual(tickets[0].slot,tickets[1].slot);
  await Promise.all(tickets.map(t=>t.completed));
  const stats=await renderer.nativeStats();
  assert.equal(stats.submitted,3);assert.equal(stats.completed,3);assert.equal(stats.inFlight,0);
  for(const key of ['frameHashes','numericalValidationPasses','imageReadbacks','pixelTransferBytes','blockingGpuWaits','diagnosticReadbacks'])assert.equal(stats[key],0,key);
  await assert.rejects(renderer.renderFrame(0),{code:'E_NATIVE_MATERIALIZATION'});
  await assert.rejects(renderer.submitNativeFrame(-1),{code:'E_FRAME_RANGE'});
  const signal=AbortSignal.abort();await assert.rejects(renderer.submitNativeFrame(2,{signal}),{code:'E_RENDER_CANCELLED'});
 }finally{await renderer.close();await renderer.close();}
 await assert.rejects(renderer.submitNativeFrame(0),{code:'E_RENDERER_CLOSED'});
});
test('native initialization errors keep stable codes and do not relax resource bounds',async()=>{
 let plan=compileNativePlan(built.manifest,{width:16,height:9});
 plan.program.version=99 as 1;
 await assert.rejects(NativeGpuClient.create(plan.program,{executable}),{code:'E_NATIVE_PROTOCOL'});
 plan=compileNativePlan(built.manifest,{width:16,height:9});plan.program.kernels[0].code='invalid WGSL';
 await assert.rejects(NativeGpuClient.create(plan.program,{executable}),{code:'E_NATIVE_SHADER'});
 plan=compileNativePlan(built.manifest,{width:16,height:9});plan.program.passes[0].inputs=[1];
 await assert.rejects(NativeGpuClient.create(plan.program,{executable}),{code:'E_NATIVE_PASS'});
});
