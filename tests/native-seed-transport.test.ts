import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import {binarySeedRequest,nativeTransportLimits} from '../modules/native-gpu/seed-transport.ts';
import {NativeGpuClient,type NativeProgram} from '../modules/native-gpu/client.ts';
import {NativeRecordingScope} from '../modules/native-gpu/scope.ts';
import {NativeBufferExporter} from '../modules/native-gpu/data-export.ts';
import {linear709} from '../src/media/surface.ts';
const executable=resolve('.frameweave/native-target/release/frameweave-native-gpu.exe');
function base():NativeProgram{return {version:2,session:randomBytes(32).toString('hex'),slots:1,maxBytes:64*1024**2,
 images:[{width:1,height:1,format:'rgba32float',alpha:'opaque',color:linear709}],
 kernels:[{code:'validity is checked later by the GPU compiler',inputCount:0,parameterWords:0,headerWords:32}],
 passes:[{kernel:0,inputs:[],output:0,header:[1,1,0,2,...Array(28).fill(0)]}],
 data:[{type:'u32',length:4,initial:[],immutable:true}],display:null};}

test('large exact typed words leave JSON without changing public seed descriptors',()=>{
 const p=base();p.data=[{length:800000,type:'u32',immutable:true,initial:Array(800000).fill(0xffffffff)},
  {length:3,type:'f32',initial:[0x80000000,0x3f800001,0xc1000000]},
  {length:2,type:'i32',initial:[0x80000000,0xffffffff]}];
 assert.ok(Buffer.byteLength(JSON.stringify(p))>8*1024**2);
 const wire=binarySeedRequest('init',p);
 assert.ok('binarySeeds'in wire.command);assert.equal(wire.payload.length,3);
 assert.ok(Buffer.byteLength(JSON.stringify(wire.command))<16384);
 assert.equal(wire.command.program.data![0].initial.length,0);assert.equal(p.data[0].initial.length,800000);
 const chunks=Array.from(wire.payload[0]);assert.ok(chunks.length>1);assert.ok(chunks.every(b=>b.length<=1024**2));
 assert.equal(chunks.reduce((n,b)=>n+b.length,0),800000*4);assert.equal(chunks.at(-1)!.readUInt32LE(chunks.at(-1)!.length-4),0xffffffff);
 const f32=Buffer.concat(Array.from(wire.payload[1])),i32=Buffer.concat(Array.from(wire.payload[2]));
 assert.equal(f32.readUInt32LE(0),0x80000000);assert.equal(f32.readUInt32LE(4),0x3f800001);
 assert.equal(i32.readInt32LE(0),-2147483648);assert.equal(i32.readInt32LE(4),-1);
});
test('transport capacity is caller policy, not a fixed 8/512 MiB ceiling',()=>{
 const p=base();p.maxBytes=32*1024**3;
 assert.equal(nativeTransportLimits(p).maxSeedBytes,32*1024**3);
 assert.equal(nativeTransportLimits(p).maxControlBytes,32*1024**3);
 assert.deepEqual(nativeTransportLimits(p,{maxSeedBytes:24*1024**3,maxControlBytes:16*1024**3}),{maxSeedBytes:24*1024**3,maxControlBytes:16*1024**3});
 assert.throws(()=>nativeTransportLimits(p,{maxSeedBytes:Infinity}),{code:'E_NATIVE_TRANSPORT_BUDGET'});
});
test('small JSON path remains compatible; configured budget and invalid words reject',()=>{
 const p=base();p.data![0].initial=[1,2,3,4];assert.equal(binarySeedRequest('init',p).payload.length,0);
 assert.throws(()=>binarySeedRequest('init',p,8),{code:'E_NATIVE_SEED_BUDGET'});
 p.data=[{type:'u32',length:20000,initial:Array(20000).fill(-1)}];
 assert.throws(()=>binarySeedRequest('init',p),{code:'E_NATIVE_DATA'});
});
function raw(command:unknown,body=Buffer.alloc(0),controlBytes=131072):Promise<any>{return new Promise((resolve,reject)=>{
 const child=spawn(executable,['--control-bytes',String(controlBytes),'--seed-bytes','67108864'],{windowsHide:true,stdio:'pipe'});
 let out='';const timer=setTimeout(()=>{child.kill();reject(Error('raw transport timeout'));},5000);
 child.stdout.setEncoding('utf8');child.stdout.on('data',s=>out+=s);child.stdin.on('error',()=>{});child.on('error',reject);
 child.on('exit',()=>{clearTimeout(timer);try{resolve(JSON.parse(out.trim().split('\n')[0]));}catch(e){reject(Error(out+String(e)));}});
 child.stdin.end(Buffer.concat([Buffer.from(JSON.stringify(command)+'\n'),body]));
 });}
test('native reader rejects duplicate/type/length/version bindings before GPU allocation',async()=>{
 const p=base(),descriptor={buffer:0,words:4,type:'u32'};
 for(const seeds of [
  {version:1,format:'words32-le',byteLength:32,buffers:[descriptor,descriptor]},
  {version:1,format:'words32-le',byteLength:16,buffers:[{...descriptor,type:'f32'}]},
  {version:1,format:'words32-le',byteLength:16,buffers:[{...descriptor,words:8}]},
  {version:2,format:'words32-le',byteLength:16,buffers:[descriptor]},
 ]){const reply=await raw({id:1,op:'init',program:p,binarySeeds:seeds});assert.equal(reply.ok,false);assert.equal(reply.error.code,'E_NATIVE_SEED_PROTOCOL');}
 const mismatch=await raw({id:1,op:'init',program:p,binarySeeds:{version:1,format:'words32-le',byteLength:20,buffers:[descriptor]}});
 assert.equal(mismatch.error.code,'E_NATIVE_SEED_BUDGET');
});
test('native reader rejects truncation and enforces caller-configured control limits',async()=>{
 const reply=await raw({id:1,op:'init',program:base(),binarySeeds:{version:1,format:'words32-le',byteLength:16,buffers:[{buffer:0,words:4,type:'u32'}]}},Buffer.alloc(4));
 assert.equal(reply.error.code,'E_NATIVE_SEED_TRUNCATED');
 const oversized=await raw({id:1,op:'stats',session:'a'.repeat(64),padding:'x'.repeat(200000)});
 assert.equal(oversized.error.code,'E_NATIVE_MESSAGE');
});
test('production GPU consumes a >8 MiB JSON-equivalent seed exactly, across init and reconfigure',async()=>{
 process.env.FRAMEWEAVE_HOME=resolve('.frameweave/user-home');
 const s=new NativeRecordingScope(),g=s.api,n=800000,words=new Uint32Array(n);
 const positions=[0,Math.floor(n/3),Math.floor(2*n/3),n-1];
 const expected=[0xffffffff,0x80000000,0x7fc01234,0x12345678];
 words.fill(0xffffffff);positions.forEach((p,i)=>words[p]=expected[i]);
 const source=await g.createBuffer({type:'u32',length:n},words);
 const compute=await g.compileCompute({abiVersion:1,id:'test/binary-seed-copy',version:'1.0.0',bindings:[{type:'u32',access:'read'},{type:'u32',access:'read_write'}],parameterWords:4,workgroupSize:[4,1,1],
  code:'fn compute(p:vec3u,l:vec3u,w:vec3u){store1(p.x,load0(paramU32(p.x)));}'});
 const pixel=await g.compile({abiVersion:1,id:'test/binary-seed-image',version:'1.0.0',inputCount:0,parameterWords:0,code:'fn pixel(p:vec2u)->vec4f{return vec4f(.1,.2,.3,1.);}'});
 s.sealInitialization();s.beginFrame();
 const result=await g.createBuffer({type:'u32',length:4});
 await g.dispatch(compute,[source,result],{workItems:[4,1,1],parameters:Uint32Array.from(positions)});
 await g.publishBuffer('result',result,{version:1});s.publish(await g.run(pixel,[],{output:{width:4,height:2,format:'rgba32float',alpha:'opaque',color:linear709}}));
 const {output:_o,parameters,external:_e,kernelOffset:_k,moduleOffset:_m,...packet}=s.packet();
 const p:NativeProgram={...packet,version:2,session:randomBytes(32).toString('hex'),slots:1,maxBytes:64*1024**2,display:null};
 assert.ok(Buffer.byteLength(JSON.stringify(p))>8*1024**2);
 const exporter=await NativeBufferExporter.create();exporter.configure(p);
 try{
  for(const reconfigure of [false,true]){
   const client=await NativeGpuClient.create(reconfigure?{...p,data:p.data!.map(d=>({...d,initial:[]}))}:p,{executable});
   try{
    if(reconfigure){const changing=client.reconfigure(p);await Promise.resolve();await Promise.all([changing,client.stats()]);}
    const ticket=await client.submit(0,parameters);await ticket.completed;
    const actual=await exporter.read(client,ticket,'result');assert.deepEqual(Array.from(actual.values),expected);
    assert.equal((await client.stats()).devicesCreated,1);
   }finally{await client.close();}
  }
 }finally{await exporter.close();await g.dispose();}
});

test('binary ray transform lengths validate before reading and singular matrices after hydration',async()=>{
 const p=base();p.rayQuery=true;
 p.data=[{type:'f32',length:9,initial:[],immutable:true},{type:'f32',length:12,initial:[]}];
 p.kernels.push({kind:'ray-build',code:'// fixed ray build',inputCount:0,parameterWords:0,headerWords:16});
 p.passes.unshift({kernel:1,inputs:[],output:0,header:Array(16).fill(0),buffers:[0],rayBuild:{
  version:1,quality:'trace',invalidGeometry:'discard',transforms:1,
  geometries:[{positions:0,count:3,mask:255,id:0}],
 }});
 const request=(words:number)=>({id:1,op:'init',program:p,binarySeeds:{version:1,format:'words32-le',
  byteLength:words*4,buffers:[{buffer:1,type:'f32',words}]}});
 const short=await raw(request(11));
 assert.equal(short.error.code,'E_NATIVE_RAY_TRANSFORM');
 assert.match(short.error.message,/affine matrices required/);
 const singular=await raw(request(12),Buffer.alloc(48));
 assert.equal(singular.error.code,'E_NATIVE_RAY_TRANSFORM');
 assert.match(singular.error.message,/inverse must be finite/);
});
