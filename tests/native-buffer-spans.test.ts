import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdir,mkdtemp,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {NativeRecordingScope} from '../modules/native-gpu/scope.ts';
import {NativeGpuClient,type NativeProgram} from '../modules/native-gpu/client.ts';
import {linear709} from '../src/media/surface.ts';

test('clear/copy split all word types at the device limit and preserve exact ranges',async()=>{
  for(const type of ['f32','i32','u32'] as const){
    const scope=new NativeRecordingScope(),g=scope.api,span=Math.min(65535,g.capabilities().limits.maxComputeWorkgroupsPerDimension)*64;
    const length=span+37,a=await g.createBuffer({type,length:length+20}),b=await g.createBuffer({type,length:length+20});
    await g.clearBuffer(a,{offset:3,length});await g.copyBuffer(a,b,{sourceOffset:2,targetOffset:7,length});
    const p=scope.packet(false);
    assert.equal(p.passes.length,4);
    assert.deepEqual(p.passes.map(v=>v.groups),[[65535,1,1],[1,1,1],[65535,1,1],[1,1,1]]);
    assert.deepEqual(p.passes.map(v=>v.header.slice(0,3)),[[span,1,1],[37,1,1],[span,1,1],[37,1,1]]);
    assert.deepEqual(p.passes.map(v=>v.header.slice(4,7)),[[0,0,0],[span,0,0],[0,0,0],[span,0,0]]);
    assert.deepEqual(p.parameters,[[3],[3],[2,7],[2,7]]);
    await assert.rejects(g.clearBuffer(a,{offset:length+20,length:1}),{code:'E_GPU_BUFFER_RANGE'});
    await assert.rejects(g.copyBuffer(a,a),{code:'E_NATIVE_SCOPE'});
    const c=new AbortController();c.abort();await assert.rejects(g.clearBuffer(a,{signal:c.signal}));
    await g.dispose();
  }
});

const executable=process.env.FRAMEWEAVE_NATIVE_GPU;
test('actual GPU copies and clears beyond one dispatch with offsets, tails and HDR floats intact',{
  skip:executable?false:'Set FRAMEWEAVE_NATIVE_GPU to a reviewed native build',
},async()=>{
  const root=resolve('.frameweave/buffer-spans');await mkdir(root,{recursive:true});
  const directory=await mkdtemp(join(root,'run-')),s=new NativeRecordingScope(),g=s.api;
  const length=65535*64+37;
  const a=await g.createBuffer({type:'f32',length}),b=await g.createBuffer({type:'f32',length});
  const fill=await g.compileCompute({abiVersion:1,id:'test/buffer-span-seed',version:'1.0.0',bindings:[{type:'f32',access:'read_write'}],
    workgroupSize:[64,1,1],parameterWords:1,code:'fn compute(p:vec3u,l:vec3u,w:vec3u){let i=p.y*4096u+p.x;if(i<paramU32(0u)){store0(i,f32(i%17u)-.25);}}'});
  await g.dispatch(fill,[a],{workItems:[4096,Math.ceil(length/4096),1],parameters:Uint32Array.of(length)});
  await g.copyBuffer(a,b,{sourceOffset:3,targetOffset:5,length:length-10});
  await g.clearBuffer(b,{offset:7,length:length-20});
  await g.publishBuffer('result',b,{version:1});
  const pixel=await g.compile({abiVersion:1,id:'test/span-output',version:'1.0.0',inputCount:0,parameterWords:0,code:'fn pixel(p:vec2u)->vec4f{return vec4f(0.,0.,0.,1.);}'});
  s.publish(await g.run(pixel,[],{output:{width:1,height:1,format:'rgba32float',color:linear709,alpha:'opaque'}}));
  const {parameters,output:_o,external:_e,kernelOffset:_k,moduleOffset:_m,...packet}=s.packet();
  const program:NativeProgram={...packet,version:2,session:randomBytes(32).toString('hex'),slots:1,maxBytes:256*1024**2,display:null,dataExport:{version:1,directory}};
  const client=await NativeGpuClient.create(program,{executable:resolve(executable!)});
  try{
    const ticket=await client.submit(0,parameters);await ticket.completed;await client.exportBuffer(ticket,'result','actual.f32');
    const bytes=await readFile(join(directory,'actual.f32'));assert.equal(bytes.length,length*4);
    for(let i=0;i<length;i++){
      const copied=i>=5&&i<length-5,cleared=i>=7&&i<length-13;
      const expected=copied&&!cleared?(i-2)%17-.25:0;
      assert.equal(bytes.readFloatLE(i*4),expected,'word '+i);
    }
  }finally{await client.close();await g.dispose();}
});
