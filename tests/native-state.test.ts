import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {resolve} from 'node:path';
import {NativeRecordingScope} from '../modules/native-gpu/scope.ts';
import {NativeGpuClient,type NativeProgram} from '../modules/native-gpu/client.ts';
import {nativeFrameCapacity} from '../modules/native-gpu/memory.ts';
import {linear709} from '../src/media/surface.ts';
const executable=resolve('.frameweave/native-target/debug/frameweave-native-gpu.exe');
async function fixture(){
 const s=new NativeRecordingScope(),g=s.api,state=await g.createStateField({type:'f32',dimensions:[1,1,1],components:4,semantic:'generic'},Float32Array.of(1,-.25,4,.5),{version:1,id:'test/state'});
 const update=await g.compileCompute({abiVersion:1,id:'test/state-step',version:'1.0.0',bindings:[{type:'f32',access:'read_write'}],workgroupSize:[1,1,1],parameterWords:1,code:'fn compute(g:vec3u,l:vec3u,w:vec3u){store0(0u,load0(0u)+paramF32(0u));}'}),draw=await g.compile({abiVersion:2,id:'test/state-display',version:'1.0.0',inputCount:0,dataInputs:[{type:'f32'}],parameterWords:0,code:'fn pixel(p:vec2u)->vec4f{return vec4f(data0(0u),data0(1u),data0(2u),data0(3u));}'});s.sealInitialization();s.beginFrame();
 await g.stateStep([state],{version:1,epoch:0,step:0,reset:true});await g.dispatch(update,[state],{workItems:[1,1,1],parameters:Float32Array.of(.125)});s.publish(await g.run(draw,[],{data:[state],output:{width:4,height:2,format:'rgba32float',alpha:'straight',color:linear709}}));
 const {parameters,output,external:_e,kernelOffset:_k,moduleOffset:_m,...packet}=s.packet(),program:NativeProgram={...packet,version:2,session:randomBytes(32).toString('hex'),slots:1,maxBytes:1024**2,display:null};return{s,g,state,program,parameters,output};
}
test('persistent state is explicit, serial, survives layout changes, and reset/replay restores exact GPU values',async()=>{
 const f=await fixture(),client=await NativeGpuClient.create(f.program,{executable});
 const submit=async(frame:number,epoch:number,step:number,reset:boolean,expected:number)=>{const parameters=structuredClone(f.parameters);parameters[0]=[epoch,step,Number(reset)];const t=await client.submit(frame,parameters);await t.completed;const p=(await client.inspectForTest(t.slot,f.output)).pixels;assert.deepEqual(p.slice(0,4),[expected,-.25,4,.5]);return p;};
 try{
  assert.equal(nativeFrameCapacity(f.program,1024**2,92).capacity,1);await submit(0,0,0,true,1.125);const first=await submit(1,0,1,false,1.25);
  const invalid=structuredClone(f.parameters);invalid[0]=[0,3,0];await assert.rejects(client.submit(8,invalid),{code:'E_NATIVE_STATE_SEQUENCE'});await submit(2,0,2,false,1.375);
  const plan=structuredClone(f.program);plan.images[0].width=8;plan.passes.at(-1)!.header[0]=8;await client.reconfigure(plan);await submit(3,0,3,false,1.5);
  await submit(9,1,0,true,1.125);const replay=await submit(4,1,1,false,1.25);assert.deepEqual(replay.slice(0,first.length),first);
  const stats=await client.stats();assert.equal(stats.persistentState.buffers,1);assert.equal(stats.imageReadbacks,0);assert.equal(stats.pixelTransferBytes,0);assert.equal(stats.devicesCreated,1);
  const bad=structuredClone(f.program);bad.slots=2;await assert.rejects(NativeGpuClient.create(bad,{executable}),{code:'E_NATIVE_STATE_CONCURRENCY'});
  console.log(JSON.stringify({case:'state-v1',stats}));
 }finally{await client.close();await f.g.dispose();}
});
test('ordinary initialization data stays immutable and persistent definitions cannot be replaced',async()=>{
 const f=await fixture(),normal=await f.g.createBuffer({type:'f32',length:1},Float32Array.of(0));await assert.rejects(f.g.stateStep([normal],{version:1,epoch:0,step:0,reset:true}),{code:'E_NATIVE_SCOPE'});await assert.rejects(f.g.createStateBuffer({type:'f32',length:1},undefined,{version:1,id:'late'}),{code:'E_NATIVE_SCOPE'});
 const client=await NativeGpuClient.create(f.program,{executable});try{const changed=structuredClone(f.program);changed.data![0].initial[0]=0;await assert.rejects(client.reconfigure(changed),{code:'E_NATIVE_STATE_RECONFIGURE'});}finally{await client.close();await f.g.dispose();}
});

test('GPU-only named checkpoints rewind cursors and restore exact float state without CPU snapshots',async()=>{
 const f=await fixture(),client=await NativeGpuClient.create(f.program,{executable});
 const step=async(n:number)=>{const p=structuredClone(f.parameters);p[0]=[0,n,Number(n===0)];const t=await client.submit(n,p);await t.completed;return(await client.inspectForTest(t.slot,f.output)).pixels;};
 try{
  await assert.rejects(client.stateCheckpoint('restore','missing'),{code:'E_NATIVE_STATE_CHECKPOINT_MISSING'});
  await assert.rejects(client.stateCheckpoint('save','early'),{code:'E_NATIVE_STATE_SEQUENCE'});
  await step(0);const saved=await client.stateCheckpoint('save','frame-0');
  assert.equal(saved.gpuOnly,true);assert.equal(saved.retainedBytes,16);
  await assert.rejects(client.stateCheckpoint('save','frame-0'),{code:'E_NATIVE_STATE_CHECKPOINT_EXISTS'});
  const reference=await step(1);await step(2);await client.stateCheckpoint('restore','frame-0');
  assert.deepEqual(await step(1),reference);
  const stats=await client.stats();assert.equal(stats.stateCheckpoints.cpuReadbacks,0);assert.equal(stats.stateCheckpoints.restores,1);
  await client.stateCheckpoint('release','frame-0');assert.equal((await client.stats()).stateCheckpoints.bytes,0);
  await assert.rejects(client.stateCheckpoint('restore','frame-0'),{code:'E_NATIVE_STATE_CHECKPOINT_MISSING'});
  await assert.rejects(client.stateCheckpoint('save','bad name'),{code:'E_NATIVE_STATE_CHECKPOINT'});
  console.log(JSON.stringify({case:'gpu-checkpoint',stats}));
 }finally{await client.close();await f.g.dispose();}
});
