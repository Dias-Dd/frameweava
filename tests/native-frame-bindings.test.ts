import test from 'node:test';import assert from 'node:assert/strict';import {randomBytes} from 'node:crypto';import {resolve} from 'node:path';
import {NativeRecordingScope} from '../modules/native-gpu/scope.ts';import {NativeGpuClient,type NativeProgram,type NativeFrameBindings} from '../modules/native-gpu/client.ts';import {linear709} from '../src/media/surface.ts';
const executable=resolve('.frameweave/native-target/debug/frameweave-native-gpu.exe'),words=(v:number[])=>Array.from(new Uint32Array(Float32Array.from(v).buffer));
async function fixture(){const s=new NativeRecordingScope(),g=s.api,constant=await g.createBuffer({type:'f32',length:1},Float32Array.of(1));s.sealInitialization();s.beginFrame();const mutable=await g.createBuffer({type:'f32',length:4},Float32Array.of(4,-.25,2,.5)),kernel=await g.compile({abiVersion:2,id:'test/frame-bindings',version:'1.0.0',inputCount:0,dataInputs:[{type:'f32'},{type:'f32'}],parameterWords:0,code:'fn pixel(p:vec2u)->vec4f{return vec4f(data0(0u)*data1(0u),data0(1u),data0(2u),data0(3u));}'});s.publish(await g.run(kernel,[],{data:[mutable,constant],output:{width:8,height:2,format:'rgba32float',alpha:'straight',color:linear709}}));const {parameters,output,external,kernelOffset,moduleOffset,...p}=s.packet(),program:NativeProgram={...p,version:2,session:randomBytes(32).toString('hex'),slots:3,maxBytes:1024**2,display:null};return{s,g,program,parameters,output};}
function bindings(p:NativeProgram,color:number[],length=4):NativeFrameBindings{const passes=p.passes.map(v=>({header:[...v.header],...v.groups?{groups:v.groups}:{},...v.draw?{count:v.draw.count}:{}}));passes[0].header[24]=length;passes[0].header[32]=length;return{version:1,data:[{index:1,length,initial:words(color)}],passes};}

test('frame-local seeds and lengths stay isolated across three independently submitted slots; plain submission restores admitted defaults',async()=>{
 const f=await fixture(),c=await NativeGpuClient.create(f.program,{executable});try{
  const colors=[[8,-.5,2,.25],[2,-.125,4,.5],[4,-1,8,.75]],tickets=await c.submitBatch(colors.map((v,i)=>({frame:i,parameters:f.parameters,frameBindings:bindings(f.program,v,4*(i+1))})));await Promise.all(tickets.map(t=>t.completed));
  for(let n=0;n<3;n++)assert.deepEqual((await c.inspectForTest(tickets[n].slot,f.output)).pixels.slice(0,4),colors[n]);
  const stats=await c.stats();assert.equal(stats.programUpdates,0);assert.equal(stats.frameBindings.slotUpdates,3);assert.equal(stats.peakSubmittedInFlight,3);assert.equal(stats.imageReadbacks,0);assert.equal(stats.pixelTransferBytes,0);assert.equal(stats.frameHashes,0);assert.equal(stats.devicesCreated,1);
  const plain=await c.submit(10,f.parameters);await plain.completed;assert.deepEqual((await c.inspectForTest(plain.slot,f.output)).pixels.slice(0,4),[4,-.25,2,.5]);assert.deepEqual(c.program.data![1].initial,words([4,-.25,2,.5]));
 }finally{await c.close();await f.g.dispose();}
});

test('frame preflight rejects immutable changes, wrong versions/headers/shape, missing buffers and oversize allocations; bad batches submit no frames',async()=>{
 const f=await fixture(),c=await NativeGpuClient.create(f.program,{executable});try{
  const valid=bindings(f.program,[2,-.25,4,.5]);const cases:[NativeFrameBindings,string][]=[];
  let b=structuredClone(valid);b.version=2 as 1;cases.push([b,'E_NATIVE_FRAME_BINDINGS']);b=structuredClone(valid);b.data[0].index=0;cases.push([b,'E_NATIVE_FRAME_BINDINGS']);b=structuredClone(valid);b.data=[];cases.push([b,'E_NATIVE_FRAME_BINDINGS']);b=structuredClone(valid);b.passes[0].header[0]=99;cases.push([b,'E_NATIVE_PASS']);b=structuredClone(valid);b.passes[0].groups=[1,1,1];cases.push([b,'E_NATIVE_FRAME_BINDINGS']);b=structuredClone(valid);b.data[0].length=1024**3;cases.push([b,'E_NATIVE_DATA']);b=structuredClone(valid);b.data[0].length=1024**2;cases.push([b,'E_NATIVE_BUDGET']);
  for(const [frameBindings,code]of cases){const before=await c.stats();await assert.rejects(c.submit(1,f.parameters,{frameBindings}),{code});assert.equal((await c.stats()).submitted,before.submitted);}
  await assert.rejects(c.submitBatch([{frame:2,parameters:f.parameters,frameBindings:valid},{frame:3,parameters:f.parameters,frameBindings:cases[0][0]}]),{code:'E_NATIVE_FRAME_BINDINGS'});assert.equal((await c.stats()).submitted,0);
  const t=await c.submit(4,f.parameters,{frameBindings:valid});await t.completed;assert.deepEqual((await c.inspectForTest(t.slot,f.output)).pixels.slice(0,4),[2,-.25,4,.5]);
 }finally{await c.close();await f.g.dispose();}
});

test('duplicate shader bodies retain each pipeline automatic-layout identity in frame-local updates',async()=>{
 const f=await fixture();f.program.kernels.push(structuredClone(f.program.kernels[0]));f.program.images.push(structuredClone(f.program.images[0]));f.program.passes.push({...structuredClone(f.program.passes[0]),kernel:1,output:1});f.parameters.push([]);
 const c=await NativeGpuClient.create(f.program,{executable});try{const t=await c.submit(0,f.parameters,{frameBindings:bindings(f.program,[8,-.5,4,.25])});await t.completed;for(const image of [0,1])assert.deepEqual((await c.inspectForTest(t.slot,image)).pixels.slice(0,4),[8,-.5,4,.25]);}finally{await c.close();await f.g.dispose();}
});
