import{createNativeReplay}from'../modules/spatial-compute/native-replay.ts';
import test from'node:test';import assert from'node:assert/strict';import{randomBytes}from'node:crypto';
import{mkdir,mkdtemp,readFile,writeFile}from'node:fs/promises';import{resolve,join}from'node:path';
import{NativeRecordingScope}from'../modules/native-gpu/scope.ts';import{NativeGpuClient,type NativeProgram}from'../modules/native-gpu/client.ts';
import{binarySeedRequest}from'../modules/native-gpu/seed-transport.ts';
import{nativeFrameCapacity}from'../modules/native-gpu/memory.ts';import{NativeFrameScheduler}from'../modules/native-gpu/scheduler.ts';
import{nativeModuleSource,nativeModuleParameters}from'../modules/native-gpu/module.ts';import{fieldInfo}from'../modules/gpu-effects/compute-contract.ts';
import{assertNativeMetadata}from'../modules/native-gpu/capacity.ts';import{linear709}from'../src/media/surface.ts';
const executable=resolve('.frameweave/native-target/debug/frameweave-native-gpu.exe'),base=resolve('.frameweave/native-capacity/numeric');
const output={width:1,height:1,format:'rgba32float' as const,alpha:'premultiplied' as const,color:linear709};
function plan(s:NativeRecordingScope):{program:NativeProgram;parameters:number[][]}{const{parameters,output:_o,external:_e,kernelOffset:_k,moduleOffset:_m,...p}=s.packet();return{program:{...p,version:2,session:randomBytes(32).toString('hex'),slots:1,maxBytes:64*1024**2,display:null},parameters};}
test('actual GPU crosses former data/seed/image/kernel/import/pass/publication limits with exact numeric output',{timeout:60000},async()=>{
 await mkdir(base,{recursive:true});const directory=await mkdtemp(join(base,'owner-')),s=new NativeRecordingScope(),g=s.api;
 const buffers=[];for(let i=0;i<300;i++)buffers.push(await g.createBuffer({type:'u32',length:64},new Uint32Array(64).fill(i)));
 const add=await g.compileCompute({abiVersion:1,id:'test/capacity-add',version:'1.0.0',bindings:[{type:'u32',access:'read_write'}],workgroupSize:[1,1,1],parameterWords:0,code:'fn compute(p:vec3u,l:vec3u,w:vec3u){store0(0u,load0(0u)+1u);}'});
 for(let n=0;n<1300;n++)await g.dispatch(add,[buffers[0]],{workItems:[1,1,1]});
 const many=await g.compileCompute({abiVersion:1,id:'test/capacity-bindings',version:'1.0.0',bindings:Array.from({length:9},(_,i)=>({type:'u32' as const,access:i===8?'read_write' as const:'read' as const})),workgroupSize:[1,1,1],parameterWords:2048,code:'/*'+'x'.repeat(530000)+'*/\nfn compute(p:vec3u,l:vec3u,w:vec3u){store8(0u,'+Array.from({length:8},(_,i)=>'load'+i+'(0u)').join('+')+'+paramU32(2047u));}'});
 const params=new Uint32Array(2048);params[2047]=42;await g.dispatch(many,buffers.slice(1,10),{workItems:[1,1,1],parameters:params});
 let image;for(let i=0;i<260;i++){const k=await g.compile({abiVersion:1,id:'test/capacity-image-'+i,version:'1.0.0',inputCount:0,parameterWords:0,code:'fn pixel(p:vec2u)->vec4f{return vec4f(2.,-.5,8.,.5);}'});image=await g.run(k,[],{output});}
 const halfKernel=await g.compile({abiVersion:2,id:'test/capacity-half',version:'1.0.0',inputCount:0,dataInputs:Array.from({length:5},()=>({type:'u32' as const})),parameterWords:0,code:'fn pixel(p:vec2u)->vec4f{return vec4f(f32(data0(0u)+data4(0u)),-.5,8.,.5);}'}),half=await g.run(halfKernel,[],{data:buffers.slice(0,5),output:{...output,format:'rgba16float'}}),halfView=await g.imageToBuffer!(half,{version:1});await g.publishBuffer('half',halfView,{version:1});s.publish(image!);await g.publishBuffer('tail',buffers[299],{version:1});const view=await g.imageToBuffer!(image!,{version:1});await g.publishBuffer('hdr',view,{version:1});for(let i=0;i<65;i++)await g.publishBuffer('buffer'+i,buffers[i],{version:1});
 const p=plan(s);p.program.dataExport={version:1,directory};p.program.resourceLease={version:1,directory};await writeFile(join(directory,'import.f32'),Buffer.from(new Float32Array([2,-.5,8,.5]).buffer));
 const first=p.program.images.length;for(let i=0;i<257;i++)p.program.images.push({...output});p.program.imports=Array.from({length:257},(_,i)=>({image:first+i,file:'import.f32',source:'declared-resource'}));
 assert.ok(p.program.passes.length>1024);assert.ok(p.program.data!.length>256);assert.ok(p.program.images.length>256);assert.ok(p.program.kernels.length>256);assert.ok(p.program.bufferOutputs!.length>64);
 const client=await NativeGpuClient.create(p.program,{executable});try{const rows:{frame:number;values:number[];counter:number;sum:number}[]=[];for(const frame of[100,0,100]){const ticket=await client.submit(frame,p.parameters);await ticket.completed;
  for(const[name,expected]of[['buffer0',1300],['buffer9',78],['tail',299]]as const){const file=name+'-'+frame+'-'+rows.length+'.f32';await client.exportBuffer(ticket,name,file);const bytes=await readFile(join(directory,file));assert.equal(bytes.readUInt32LE(0),expected);}
  const halfFile='half-'+rows.length+'.f32';await client.exportBuffer(ticket,'half',halfFile);const halfBytes=await readFile(join(directory,halfFile));assert.deepEqual(Array.from(new Float32Array(halfBytes.buffer.slice(halfBytes.byteOffset,halfBytes.byteOffset+halfBytes.byteLength))),[1304,-.5,8,.5]);
  const file='hdr-'+rows.length+'.f32';await client.exportBuffer(ticket,'hdr',file);const bytes=await readFile(join(directory,file)),values=Array.from(new Float32Array(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)));assert.deepEqual(values,[2,-.5,8,.5]);rows.push({frame,values,counter:1300,sum:78});}
  const stats=await client.stats();assert.equal(stats.devicesCreated,1);const wire=binarySeedRequest('init',p.program);assert.equal((wire.command as any).binarySeeds.buffers.length,300);assert.equal((wire.command as any).binarySeeds.byteLength,300*64*4);assert.equal(stats.capabilities.capacityPolicy,'configured-metadata-and-device-budget');await writeFile(join(base,'result.json'),JSON.stringify({rows,counts:{data:p.program.data!.length,kernels:p.program.kernels.length,images:p.program.images.length,imports:p.program.imports.length,passes:p.program.passes.length,publications:p.program.bufferOutputs!.length},stats},null,2));
 }finally{await client.close();await g.dispose();}
});
test('capacity follows configured bytes and actual device uniforms, not former constants',async()=>{
 const s=new NativeRecordingScope(),k=await s.api.compile({abiVersion:1,id:'test/capacity-bounds',version:'1.0.0',inputCount:0,parameterWords:0,code:'fn pixel(p:vec2u)->vec4f{return vec4f(1.);}'});s.publish(await s.api.run(k,[],{output}));const{program}=plan(s);
 assert.equal(nativeFrameCapacity(program,64*1024**2,192).capacity,192);const scheduler=new NativeFrameScheduler({mode:'throughput',capacity:192,initial:192});assert.equal(scheduler.concurrency,192);
 for(const version of[1,2]as const){const slots={...program,version,slots:129},client=await NativeGpuClient.create(slots,{executable});try{const t=await client.submit(0,[[]]);await t.completed;assert.equal((await client.stats()).slots,129);}finally{await client.close();}}
 const queued=await NativeGpuClient.create(program,{executable,transport:{maxQueuedBytes:1024**2}});try{const tickets=await Promise.all(Array.from({length:270},(_,frame)=>queued.submit(frame,[[]])));await Promise.all(tickets.map(t=>t.completed));const batches=await Promise.all(Array.from({length:21},(_,n)=>queued.submitBatch([{frame:n+270,parameters:[[]]}])));await Promise.all(batches.flat().map(t=>t.completed));assert.equal((await queued.stats()).completed,291);}finally{await queued.close();}
 const bounded=await NativeGpuClient.create(program,{executable,transport:{maxQueuedBytes:1}});try{await assert.rejects(bounded.submitBatch([{frame:0,parameters:[[]]}]),{code:'E_NATIVE_BACKPRESSURE'});}finally{await bounded.close();}
 await assert.rejects(NativeGpuClient.create({...program,maxBytes:128},{executable}),{code:'E_NATIVE_METADATA_BUDGET'});
 const huge=structuredClone(program);huge.kernels[0].parameterWords=16384;await assert.rejects(NativeGpuClient.create(huge,{executable}),{code:'E_NATIVE_DEVICE_LIMIT'});await s.api.dispose();
});
test('large module/source/metadata/state declarations preserve validation without fixed authored-data caps',async()=>{
 const s=new NativeRecordingScope(),g=s.api;const states=[];for(let i=0;i<70;i++)states.push(await g.createStateBuffer({type:'u32',length:1},undefined,{version:1,id:'state'+i}));
 const spec={version:1 as const,id:'frameweave.servo' as const,moduleVersion:'0.1.0' as const,profile:'sdr-srgb8' as const,execution:'trusted-local' as const,width:4097,height:4097,input:false,html:'x'.repeat(2*1024**2+1),timeoutMs:60000};assert.equal(nativeModuleSource(spec).width,4097);
 for(let i=0;i<17;i++)await g.createModule({...spec,width:1,height:1,html:''});s.sealInitialization();s.beginFrame();await g.stateStep(states,{version:1,epoch:0,step:0,reset:true});assert.equal(s.packet(false).passes[0].buffers!.length,70);
 const context={frame:0,globalFrame:0,time:0,globalTime:0,dt:1/24,progress:0,fps:{num:24,den:1},durationInFrames:1,seed:0},text='字'.repeat(5000),words=nativeModuleParameters({context,parameters:{text}});assert.ok(words.length>1024);assert.ok(words[0]>4092);
 assert.throws(()=>nativeModuleParameters({context,parameters:{bad:NaN}}),{code:'E_NATIVE_MODULE'});const cyclic:any={};cyclic.value=cyclic;assert.throws(()=>nativeModuleParameters({context,parameters:cyclic}),{code:'E_NATIVE_MODULE'});
 const metadata={items:Array.from({length:500},(_,i)=>({id:i,label:'x'.repeat(128)}))};assert.equal((fieldInfo({type:'f32',dimensions:[1,1,1],components:1,semantic:'generic',metadata}).metadata as any).items.length,500);
 assert.throws(()=>assertNativeMetadata({data:[],other:{initial:Array(2000).fill(1)}},1024),{code:'E_NATIVE_METADATA_BUDGET'});await g.dispose();
});

test('replay submission thresholds are configurable and never reject mixed programs by pass count',async()=>{
 const state:any={},context:any={frame:1000,globalFrame:1000,time:1000/24,globalTime:1000/24,dt:1/24,fps:{num:24,den:1},durationInFrames:1001,progress:1,seed:1};
 for(const eligible of[false,true]){let pending=0,flushes=0,steps=0;const gpu:any={stateStep:async()=>{pending++;},stats:()=>({pendingPasses:pending,stateSegmentEligible:eligible}),flushState:async()=>{flushes++;pending=0;}};
 const runner=createNativeReplay(gpu,[state],{segmentPasses:100});await runner.record(context,async()=>{steps++;});assert.equal(steps,1000);assert.equal(flushes,eligible?10:0);}
});
