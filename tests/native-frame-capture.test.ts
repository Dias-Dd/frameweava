import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {NativeRecordingScope} from '../modules/native-gpu/scope.ts';
import {NativeGpuClient,type NativeFrameBindings,type NativeProgram} from '../modules/native-gpu/client.ts';
import {NativeBufferExporter} from '../modules/native-gpu/data-export.ts';
import {nativeExecutable} from '../modules/native-gpu/executable.ts';
import {nativeFrameCapacity} from '../modules/native-gpu/memory.ts';
import {linear709} from '../src/media/surface.ts';
import {pixelsFromSurface} from '../src/media/surface.ts';
import {buildProject} from '../src/compiler/build.ts';
import {Renderer} from '../src/render/renderer.ts';
process.env.FRAMEWEAVE_HOME=resolve('.frameweave/user-home');
const words=(v:number[])=>Array.from(new Uint32Array(Float32Array.from(v).buffer));
async function fixture(){
  const s=new NativeRecordingScope(),g=s.api;s.sealInitialization();s.beginFrame();
  const data=await g.createBuffer({type:'f32',length:4},Float32Array.of(1,-.25,4,1));
  const k=await g.compile({abiVersion:2,id:'test/captured-frames',version:'1.0.0',inputCount:0,dataInputs:[{type:'f32'}],parameterWords:0,
    code:'fn pixel(p:vec2u)->vec4f{return vec4f(data0(0u),data0(1u),data0(2u),data0(3u));}'});
  await g.publishBuffer('values',data,{version:1});s.publish(await g.run(k,[],{data:[data],output:{width:8,height:2,format:'rgba32float',color:linear709,alpha:'opaque'}}));
  const {parameters,output,external,kernelOffset,moduleOffset,...packet}=s.packet();
  const program:NativeProgram={...packet,version:2,session:randomBytes(32).toString('hex'),slots:3,maxBytes:64*1024**2,display:null,readbacks:['values']};
  const exporter=await NativeBufferExporter.create();exporter.configure(program);
  const bindings=(v:number[]):NativeFrameBindings=>({version:1,data:[{index:0,length:4,initial:words(v)}],passes:program.passes.map(p=>({header:[...p.header],...p.groups?{groups:p.groups}:{}}))});
  return {g,program,parameters,exporter,bindings};
}
test('captured publications preserve independent frame bindings, exact owned words and stale-ticket rejection',async()=>{
  const f=await fixture(),client=await NativeGpuClient.create(f.program,{executable:await nativeExecutable()});
  try{
    const colors=[[2,-.5,8,1],[4,-.25,16,1],[8,-1,32,1]];
    const tickets=await client.submitBatch(colors.map((v,frame)=>({frame,parameters:f.parameters,frameBindings:f.bindings(v)})));
    for(let i=0;i<tickets.length;i++){
      const value=await f.exporter.read(client,tickets[i],'values');assert.deepEqual(Array.from(value.values),colors[i]);
      assert.equal(value.values.buffer.byteLength,16);assert.equal(value.values.byteOffset,0);
    }
    const bad=f.bindings(colors[0]);bad.data[0].length=8;
    await assert.rejects(client.submit(4,f.parameters,{frameBindings:bad}),{code:'E_NATIVE_FRAME_BINDINGS'});
    const replacement=await client.submit(5,f.parameters,{frameBindings:f.bindings([64,-2,128,1])});await replacement.completed;
    await assert.rejects(f.exporter.read(client,tickets.find(t=>t.slot===replacement.slot)!,'values'),{code:'E_NATIVE_DATA_STALE'});
    assert.deepEqual(Array.from((await f.exporter.read(client,replacement,'values')).values),[64,-2,128,1]);
    const stats=await client.stats();assert.equal(stats.programUpdates,0);assert.equal(stats.frameBindings.slotUpdates,4);assert.equal(stats.peakSubmittedInFlight,3);
    assert.deepEqual(await readdir(f.exporter.lease.directory),[]);
  }finally{await client.close();await f.exporter.close();await f.g.dispose();}
});
test('capture is explicit, named, versioned and charged to operator memory admission',async()=>{
  const f=await fixture();
  try{
    const executable=await nativeExecutable();
    for(const [readbacks,code] of [[['missing'],'E_NATIVE_DATA_OUTPUT'],[['values','values'],'E_NATIVE_DATA_CAPTURE']] as const)
      await assert.rejects(NativeGpuClient.create({...f.program,readbacks:[...readbacks]},{executable}),{code});
    await assert.rejects(NativeGpuClient.create({...f.program,dataExport:undefined},{executable}),{code:'E_NATIVE_DATA_CAPTURE'});
    const a=nativeFrameCapacity(f.program,f.program.maxBytes,3),b=nativeFrameCapacity({...f.program,readbacks:[]},f.program.maxBytes,3);
    assert.equal(a.perFrame-b.perFrame,16);
  }finally{await f.exporter.close();await f.g.dispose();}
});
test('retained host reads prevent slot reuse, allow cancellation and release only their own ticket',async()=>{
  const f=await fixture();f.program.slots=1;
  const client=await NativeGpuClient.create(f.program,{executable:await nativeExecutable()});
  try{
    const held=await client.submit(0,f.parameters,{retainSlot:true});await held.completed;
    const controller=new AbortController(),cancelled=client.submit(1,f.parameters,{signal:controller.signal});controller.abort();
    await assert.rejects(cancelled,{code:'E_RENDER_CANCELLED'});
    let submitted=false;const next=client.submit(2,f.parameters).then(t=>{submitted=true;return t;});
    assert.equal((await client.stats()).submitted,1);assert.equal(submitted,false);
    assert.throws(()=>client.releaseFrame({...held}),{code:'E_NATIVE_DATA_TICKET'});
    assert.deepEqual(Array.from((await f.exporter.read(client,held,'values')).values),[1,-.25,4,1]);
    client.releaseFrame(held);client.releaseFrame(held);
    const ticket=await next;await ticket.completed;assert.equal((await client.stats()).submitted,2);
  }finally{await client.close();await f.exporter.close();await f.g.dispose();}
});
test('Renderer batches fixed AOV output without plan reconfiguration or lost frame identity',async()=>{
  const parent=resolve('.frameweave/capture-renderer');await mkdir(parent,{recursive:true});const dir=await mkdtemp(join(parent,'case-')),entry=join(dir,'project.tsx');await writeFile(join(dir,'asset.bin'),new Uint8Array(4));
  await writeFile(entry,`import {Composition,Stage,Layer,Resource,ref} from '@frameweave/engine';import {defineNativeStage,linear709} from '@frameweave/engine/native';
export const image=defineNativeStage(async init=>{const k=await init.gpu.compile({abiVersion:2,id:'test/frame-aov',version:'1.0.0',inputCount:0,dataInputs:[{type:'f32'},{type:'u32'}],parameterWords:0,code:'fn pixel(p:vec2u)->vec4f{return vec4f(data0(0u)+f32(data1(0u)),data0(1u),data0(2u),data0(3u));}'});return {async renderAt(c){const resource=await init.gpu.importBufferResource({version:1,id:'asset',profile:'raw-bytes-v1',bytes:4});const data=await init.gpu.createBuffer({type:'f32',length:4},Float32Array.of(c.frame+1,-.25,4,1));await init.gpu.publishBuffer('values',data,{version:1});return init.gpu.run(k,[],{data:[data,resource.buffer],output:{width:8,height:2,format:'rgba32float',color:linear709,alpha:'opaque'}});}};});
export default <Composition width={8} height={2} fps={24} durationInFrames={8}><Resource id="asset" src="./asset.bin" kind="file"/><Stage id="fx" factory={image}/><Layer source={ref('fx')}/></Composition>;`);
  const renderer=await Renderer.create(await buildProject(entry),{nativeGpu:{executable:await nativeExecutable(),dynamic:'throughput',slots:3,maxBytes:64*1024**2,readback:'final-surface',captureBuffers:['fx/values','frameweave.final-surface']}});
  try{
    await renderer.prepareNativeFrame(0);
    const before=await renderer.nativeStats();
    for(const frames of [[0,1,2],[6,0,6]]){
      const tickets=await renderer.submitNativeBatch(frames);
      for(const t of tickets){
        const values=(await renderer.exportNativeBuffer(t,'fx/values')).values;
        const beauty=(await renderer.exportNativeBuffer(t,'frameweave.final-surface')).values;
        assert.deepEqual(Array.from(values),[t.frame+1,-.25,4,1]);assert.deepEqual(Array.from(beauty.slice(0,4)),Array.from(values));
      }
    }
    const after=await renderer.nativeStats();assert.equal(after.programUpdates,before.programUpdates);assert.ok(after.frameBindings.slotUpdates>=5);assert.equal(after.peakSubmittedInFlight,3);assert.equal(after.resourceImports.binaryUploadBytes,4);
  }finally{await renderer.close();}
});
test('owned Surface pipeline drains old values before arbitrary graph changes and stays deterministic',async()=>{
  const parent=resolve('.frameweave/capture-renderer');await mkdir(parent,{recursive:true});
  const dir=await mkdtemp(join(parent,'dynamic-')),entry=join(dir,'project.tsx');
  await writeFile(entry,`import {Composition,Stage,Layer,ref} from '@frameweave/engine';import {defineNativeStage,linear709} from '@frameweave/engine/native';
export const image=defineNativeStage(async init=>{const k=await init.gpu.compile({abiVersion:2,id:'test/dynamic-capture',version:'1.0.0',inputCount:0,dataInputs:[{type:'f32'}],parameterWords:0,code:'fn pixel(p:vec2u)->vec4f{return vec4f(data0(0u),data0(1u),data0(2u),data0(3u));}'});return {async renderAt(c){const data=await init.gpu.createBuffer({type:'f32',length:4},Float32Array.of(c.frame+1,-.25,4,1));if(c.frame%2){const copy=await init.gpu.cloneBuffer(data);await init.gpu.copyBuffer(copy,data);}return init.gpu.run(k,[],{data:[data],output:{width:8,height:2,format:'rgba32float',color:linear709,alpha:'opaque'}});}};});
export default <Composition width={8} height={2} fps={24} durationInFrames={8}><Stage id="fx" factory={image}/><Layer source={ref('fx')}/></Composition>;`);
  const renderer=await Renderer.create(await buildProject(entry),{nativeGpu:{executable:await nativeExecutable(),dynamic:'throughput',slots:2,maxBytes:64*1024**2,readback:'final-surface',captureBuffers:['frameweave.final-surface']}});
  try{
    const frames=[0,1,2,3,1,0],surfaces=await Promise.all(frames.map(frame=>renderer.renderNativeSurface(frame)));
    for(let i=0;i<frames.length;i++)assert.deepEqual(Array.from(pixelsFromSurface(surfaces[i]).slice(0,4)),[frames[i]+1,-.25,4,1]);
    assert.ok((await renderer.nativeStats()).programUpdates>=3);
  }finally{await renderer.close();await renderer.close();}
});
test('prefetched owned Surfaces keep persistent GPU state serial and numerically exact',async()=>{
  const parent=resolve('.frameweave/capture-renderer');await mkdir(parent,{recursive:true});
  const dir=await mkdtemp(join(parent,'state-')),entry=join(dir,'project.tsx');
  await writeFile(entry,`import {Composition,Stage,Layer,ref} from '@frameweave/engine';import {defineNativeStage,linear709} from '@frameweave/engine/native';
export const image=defineNativeStage(async init=>{const g=init.gpu,state=await g.createStateBuffer({type:'f32',length:4},Float32Array.of(1,-.25,4,1),{version:1,id:'counter'}),add=await g.compileCompute({abiVersion:1,id:'test/captured-state',version:'1.0.0',bindings:[{type:'f32',access:'read_write'}],parameterWords:0,workgroupSize:[1,1,1],code:'fn compute(p:vec3u,l:vec3u,w:vec3u){store0(0u,load0(0u)+.125);}'}),pixel=await g.compile({abiVersion:2,id:'test/captured-state-image',version:'1.0.0',inputCount:0,dataInputs:[{type:'f32'}],parameterWords:0,code:'fn pixel(p:vec2u)->vec4f{return vec4f(data0(0u),data0(1u),data0(2u),data0(3u));}'});return {async renderAt(c){await g.stateStep([state],{version:1,epoch:0,step:c.frame,reset:c.frame===0});await g.dispatch(add,[state],{workItems:[1,1,1]});return g.run(pixel,[],{data:[state],output:{width:8,height:2,format:'rgba32float',color:linear709,alpha:'opaque'}});}};});
export default <Composition width={8} height={2} fps={24} durationInFrames={8} background="transparent"><Stage id="fx" factory={image}/><Layer source={ref('fx')}/></Composition>;`);
  const renderer=await Renderer.create(await buildProject(entry),{nativeGpu:{executable:await nativeExecutable(),dynamic:'throughput',slots:3,maxBytes:64*1024**2,readback:'final-surface',captureBuffers:['frameweave.final-surface']}});
  try{
    const surfaces=await Promise.all([0,1,2,3].map(frame=>renderer.renderNativeSurface(frame)));
    for(let i=0;i<surfaces.length;i++)assert.deepEqual(Array.from(pixelsFromSurface(surfaces[i]).slice(0,4)),[1+(i+1)*.125,-.25,4,1]);
    const stats=await renderer.nativeStats();assert.equal(stats.slots,1);assert.equal(stats.peakSubmittedInFlight,1);
  }finally{await renderer.close();}
});
