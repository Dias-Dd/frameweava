import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {resolve} from 'node:path';
import {NativeGpuClient,type NativeProgram} from '../modules/native-gpu/client.ts';
import {configureNativeDisplay} from '../modules/native-gpu/display.ts';
import {linear709,acescg} from '../src/media/surface.ts';
const executable=resolve('.frameweave/native-target/debug/frameweave-native-gpu.exe');
const bits=(v:number)=>new Uint32Array(Float32Array.of(v).buffer)[0];
function fixture(width=8):NativeProgram{
 const p:NativeProgram={version:2,session:randomBytes(32).toString('hex'),slots:2,maxBytes:4*1024**2,
  images:[{width,height:2,format:'rgba32float',alpha:'straight',color:linear709}],data:[{type:'f32',length:4,initial:[4,-.25,2,.5].map(bits)}],
  kernels:[{inputCount:0,headerWords:16,parameterWords:1,code:`
@group(0) @binding(0) var<storage,read> source:array<f32>;
@group(0) @binding(1) var<storage,read_write> output:array<vec4f>;
@group(0) @binding(2) var<uniform> fwparams:array<vec4u,5>;
@compute @workgroup_size(8,8) fn fw_main(@builtin(global_invocation_id) p:vec3u){
 if(p.x>=fwparams[0].x||p.y>=fwparams[0].y||p.x>=fwparams[4].x){return;}
 output[p.y*fwparams[0].x+p.x]=vec4f(source[0],source[1],source[2],source[3]);}
`}],passes:[{kernel:0,inputs:[],output:0,data:[0],header:[width,2,0,1,...Array(12).fill(0)]}],display:null};
 configureNativeDisplay(p,0);return p;
}
async function read(c:NativeGpuClient,frame:number,cutoff=100){const t=await c.submit(frame,[[cutoff]]);await t.completed;return{scene:(await c.inspectForTest(t.slot,0)).pixels,display:(await c.inspectDisplayForTest(t.slot)).pixels};}

test('plan reuse preserves fresh-plan zeros, changing seeds, isolated slots and exact fresh-owner display',async()=>{
 const p=fixture(),c=await NativeGpuClient.create(p,{executable});
 try{
  for(let n=0;n<2;n++)assert.deepEqual((await read(c,n)).scene.slice(0,4),[4,-.25,2,.5]);
  const old=await c.stats(),q=structuredClone(p);q.data![0].length=8;q.data![0].initial=[2,-.5,3,.25].map(bits);await c.reconfigure(q);
  let changed;for(let n=2;n<4;n++){changed=await read(c,n,1);assert.deepEqual(changed.scene.slice(0,4),[2,-.5,3,.25]);assert.ok(changed.scene.slice(4,32).every(v=>v===0),'reused allocation must have fresh-plan zero semantics');}
  const stats=await c.stats();assert.equal(stats.pipelineCache.computeAndMeshCreated,old.pipelineCache.computeAndMeshCreated);assert.ok(stats.pipelineCache.workingBuffersReused>=2);assert.equal(stats.pipelineCache.displayReuses,1);assert.equal(stats.pipelineCache.retention,'current-program-only');
  const fresh=await NativeGpuClient.create({...q,session:randomBytes(32).toString('hex')},{executable});try{assert.deepEqual(await read(fresh,3,1),changed);assert.equal((await fresh.stats()).pipelineCache.computeAndMeshReused,0);}finally{await fresh.close();}
 }finally{await c.close();}
});

test('changed WGSL recompiles and invalid shader is rejected despite a warm cache',async()=>{
 const p=fixture(),c=await NativeGpuClient.create(p,{executable});try{
  await read(c,0);const before=await c.stats(),q=structuredClone(p);q.kernels[0].code=q.kernels[0].code.replace('vec4f(source[0],','vec4f(source[0]*2.,');await c.reconfigure(q);
  assert.equal((await read(c,1)).scene[0],8);assert.ok((await c.stats()).pipelineCache.computeAndMeshCreated>before.pipelineCache.computeAndMeshCreated);
  q.kernels[0].code='invalid wgsl';await assert.rejects(c.reconfigure(q),{code:'E_NATIVE_SHADER'});
 }finally{await c.close();}
});

test('display code, dimensions, profile and LUT identity invalidate retained display resources',async()=>{
 const p=fixture(),c=await NativeGpuClient.create(p,{executable});try{
  await read(c,0);const q=structuredClone(p);q.display!.shader+='\n// a new reviewed display shader\n';await c.reconfigure(q);await read(c,1);assert.equal((await c.stats()).pipelineCache.displayReuses,0);
  const wide=fixture(16);wide.session=p.session;await c.reconfigure(wide);assert.equal((await read(c,2)).scene.length,16*2*4);assert.equal((await c.stats()).pipelineCache.displayReuses,0);
  wide.images[0].color=acescg;configureNativeDisplay(wide,0);await c.reconfigure(wide);assert.ok((await read(c,3)).display.every(Number.isFinite));assert.equal((await c.stats()).pipelineCache.displayReuses,0);
  wide.display!.reach[0]^=1;await c.reconfigure(wide);await read(c,4);assert.equal((await c.stats()).pipelineCache.displayReuses,0);
  await c.reconfigure(wide);await read(c,5);assert.equal((await c.stats()).pipelineCache.displayReuses,1);
 }finally{await c.close();}
});
