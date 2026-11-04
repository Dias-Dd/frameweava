import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {resolve} from 'node:path';
import {NativeRecordingScope} from '../modules/native-gpu/scope.ts';
import {NativeGpuClient,type NativeProgram} from '../modules/native-gpu/client.ts';
import {nativeFrameCapacity,residentLayout} from '../modules/native-gpu/memory.ts';
import {NativeFrameScheduler} from '../modules/native-gpu/scheduler.ts';
import {cellularVolume,renderVolume} from '../modules/spatial-compute/index.ts';
import {linear709} from '../src/media/surface.ts';
import {twistPositions} from '../modules/mesh-deformation/index.ts';
const executable=resolve(process.env.FRAMEWEAVE_NATIVE_GPU??'.frameweave/native-target/debug/frameweave-native-gpu.exe');
function program(scope:NativeRecordingScope,slots=2):NativeProgram{const {output,parameters,external,kernelOffset:_offset,...p}=scope.packet();return {...p,version:2,session:randomBytes(32).toString('hex'),slots,maxBytes:256*1024**2,display:null};}
test('native shared scope runs a real existing typed-field effect through compute and pixel ABI2',async()=>{
 const scope=new NativeRecordingScope(),context={frame:3,globalFrame:3,time:.125,globalTime:.125,dt:1/24,progress:.125,fps:{num:24,den:1},durationInFrames:24,seed:31};
 const volume=await cellularVolume(scope.api,context,{dimensions:[8,8,8],strength:2});
 scope.publish(await renderVolume(scope.api,volume,context,{width:32,height:18,steps:16}));
 const p=program(scope),client=await NativeGpuClient.create(p,{executable});
 try{const packet=scope.packet();for(const frame of [3,9,3]){const t=await client.submit(frame,packet.parameters);await t.completed;const {pixels}=await client.inspectForTest(t.slot,packet.output);assert.equal(pixels.length,32*18*4);assert.ok(pixels.some(v=>v>0));assert.ok(pixels.every(Number.isFinite));}const s=await client.stats();assert.equal(s.numericalValidationPasses,0);assert.equal(s.diagnosticReadbacks,3);}finally{await client.close();await scope.api.dispose();}
});
test('92 real native frame submissions have separate bounded slots, and drain cleanly',async()=>{
 const scope=new NativeRecordingScope(),k=await scope.api.compile({abiVersion:1,id:'test/92-frames',version:'1.0.0',inputCount:0,parameterWords:1,code:'fn pixel(p:vec2u)->vec4f{return vec4f(paramF32(0u),-1.,4.,1.);}'});
 scope.publish(await scope.api.run(k,[],{parameters:new Float32Array([.5]),output:{width:32,height:18,format:'rgba32float',alpha:'opaque',color:linear709}}));
 const p=program(scope,92),client=await NativeGpuClient.create(p,{executable});
 try{const packet=scope.packet(),tickets=await client.submitBatch(Array.from({length:92},(_,frame)=>({frame,parameters:packet.parameters})));assert.equal(new Set(tickets.map(t=>t.slot)).size,92);await Promise.all(tickets.map(t=>t.completed));const s=await client.stats();assert.equal(s.submitted,92);assert.equal(s.completed,92);assert.equal(s.peakSubmittedInFlight,92);assert.equal(s.imageReadbacks,0);}finally{await client.close();}
});
test('existing mesh deformation feeds native triangle rasterization without CPU geometry readback',async()=>{
 const scope=new NativeRecordingScope(),context={frame:0,globalFrame:0,time:0,globalTime:0,dt:1/24,progress:0,fps:{num:24,den:1},durationInFrames:24,seed:31};
 const positions=await scope.api.createField({type:'f32',dimensions:[3,1,1],components:3,semantic:'position',space:'world',units:'meter'},new Float32Array([-.8,-.8,.5,.8,-.8,.5,0,.8,.5]));
 const transformed=await twistPositions(scope.api,positions,context,{rate:.1});
 const result=await scope.api.drawMesh({positions:transformed,color:[2,-.25,4,.5],output:{width:32,height:18,format:'rgba32float',alpha:'premultiplied',color:linear709}});scope.publish(result);
 const p=program(scope),client=await NativeGpuClient.create(p,{executable});
 try{const packet=scope.packet(),t=await client.submit(0,packet.parameters);await t.completed;const {pixels}=await client.inspectForTest(t.slot,packet.output);const center=(9*32+16)*4;assert.deepEqual(pixels.slice(center,center+4),[1,-.125,2,.5]);assert.equal(pixels[3],0);const s=await client.stats();assert.equal(s.pixelTransferBytes,0);assert.equal(s.diagnosticReadbacks,1);}finally{await client.close();}
});
test('dynamic concurrency reacts to throughput regression and respects interactive latency',()=>{
 const scheduler=new NativeFrameScheduler({mode:'throughput',capacity:128,initial:8});assert.equal(scheduler.observe(8,8).next,12);assert.equal(scheduler.observe(12,24).next,8);
 const preview=new NativeFrameScheduler({mode:'interactive',capacity:128});assert.equal(preview.observe(2,30).next,2); // keep CPU/GPU overlap rather than serializing a slow frame
 const serial=new NativeFrameScheduler({mode:'interactive',capacity:1});assert.equal(serial.observe(1,200).next,1);
 for(let i=0;i<20;i++)assert.equal(preview.observe(1,200).next,2);
});
test('initial immutable GPU buffers upload once and remain readable across frames and 92 slots',async()=>{
 const scope=new NativeRecordingScope(),buffer=await scope.api.createBuffer({type:'f32',length:4},new Float32Array([2,-.25,4,1])),kernel=await scope.api.compile({abiVersion:2,id:'test/immutable',version:'1.0.0',inputCount:0,dataInputs:[{type:'f32'}],parameterWords:0,code:'fn pixel(p:vec2u)->vec4f{return vec4f(data0(0u),data0(1u),data0(2u),data0(3u));}'});
 scope.sealInitialization();scope.beginFrame();scope.publish(await scope.api.run(kernel,[],{data:[buffer],output:{width:2,height:1,format:'rgba32float',alpha:'opaque',color:linear709}}));const first=scope.packet(),{external,kernelOffset,output,parameters,...resources}=first,p:NativeProgram={...resources,version:2,session:randomBytes(32).toString('hex'),slots:92,maxBytes:1024**2,display:null},c=await NativeGpuClient.create(p,{executable});
 try{scope.beginFrame();await assert.rejects(scope.api.clearBuffer(buffer),{code:'E_NATIVE_SCOPE'});scope.publish(await scope.api.run(kernel,[],{data:[buffer],output:{width:2,height:1,format:'rgba32float',alpha:'opaque',color:linear709}}));const next=scope.packet();assert.equal(next.kernels.length,0);assert.equal(next.data[0].seedOmitted,true);const tickets=await c.submitBatch([0,1,2].map(frame=>({frame,parameters:next.parameters})));await Promise.all(tickets.map(t=>t.completed));const {pixels}=await c.inspectForTest(tickets[2].slot,next.output);assert.deepEqual(pixels.slice(0,4),[2,-.25,4,1]);const stats=await c.stats();assert.equal(stats.allocatedDataBytes,16);}finally{await c.close();}
});
test('allocation layout reuses dead intermediates and budgets data and all frame slots',()=>{
 const image={width:100,height:100,format:'rgba32float',alpha:'opaque',color:linear709};
 const p:NativeProgram={version:1,session:'a'.repeat(64),slots:2,maxBytes:1024**3,display:null,images:[image,image,image],kernels:[{code:'',inputCount:0,parameterWords:0,headerWords:32}],passes:[{kernel:0,inputs:[],output:0,header:[]},{kernel:0,inputs:[0],output:1,header:[]},{kernel:0,inputs:[1],output:2,header:[]}]};
 const layout=residentLayout(p);assert.deepEqual(layout.mapping,[0,1,0]);assert.equal(layout.bytes,320000);assert.equal(nativeFrameCapacity(p,1024**3).capacity,128);
});
