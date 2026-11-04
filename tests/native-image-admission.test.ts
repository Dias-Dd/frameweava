import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {resolve} from 'node:path';
import {NativeRecordingScope} from '../modules/native-gpu/scope.ts';
import {NativeGpuClient,type NativeProgram} from '../modules/native-gpu/client.ts';
import {nativePixelInfo,nativeTextureInfo} from '../modules/native-gpu/image-info.ts';
import {nativeFrameCapacity} from '../modules/native-gpu/memory.ts';
import {pixelInfo} from '../modules/gpu-effects/pixel-shader.ts';
import {estimateGpuImage} from '../modules/gpu-effects/compute-capabilities.ts';
import {linear709,toHalf,fromHalf} from '../src/media/surface.ts';
const executable=resolve('.frameweave/native-target/debug/frameweave-native-gpu.exe'),output={format:'rgba32float' as const,alpha:'straight' as const,color:linear709};
async function fixture(width:number,height:number,format:'rgba16float'|'rgba32float'='rgba32float'){
 const s=new NativeRecordingScope(),g=s.api,k=await g.compile({abiVersion:1,id:'test/dynamic-image/source',version:'1.0.0',inputCount:0,parameterWords:0,code:'fn pixel(p:vec2u)->vec4f{return vec4f(f32(p.x)*.125,-f32(p.y)*.25,4.+f32((p.x+p.y)%17u),.5);}'}),image=await g.run(k,[],{output:{...output,width,height,format}}),read=await g.compile({abiVersion:1,id:'test/dynamic-image/corners',version:'1.0.0',inputCount:1,parameterWords:0,code:'fn pixel(p:vec2u)->vec4f{let d=vec2i(size0());let v=array<vec2i,6>(vec2i(0),vec2i(d.x-1,0),vec2i(0,d.y-1),d-vec2i(1),d/2,vec2i(max(0,d.x-2),max(0,d.y-3)));return read0(v[p.x]);}'});s.publish(await g.run(read,[image],{output:{...output,width:6,height:1}}));
 const {output:imageIndex,parameters,external:_e,kernelOffset:_k,...p}=s.packet(),program:NativeProgram={...p,version:2,session:randomBytes(32).toString('hex'),slots:1,maxBytes:1024**3,display:null};return {s,program,parameters,imageIndex};
}

test('Native admits 4097 squared F16/F32 images on actual GPU; both metadata paths have no fixed 16MP policy',async()=>{
 assert.equal(pixelInfo({...output,width:4097,height:4097}).width,4097);const results=[];
 assert.equal(estimateGpuImage({...output,width:4097,height:4097}).workingBytes,268566544);
 for(const format of ['rgba32float','rgba16float'] as const){const f=await fixture(4097,4097,format),c=await NativeGpuClient.create(f.program,{executable});try{const t=await c.submit(0,f.parameters);await t.completed;const p=(await c.inspectForTest(t.slot,f.imageIndex)).pixels,coords=[[0,0],[4096,0],[0,4096],[4096,4096],[2048,2048],[4095,4094]],expected=coords.flatMap(([x,y])=>[x*.125,-y*.25,4+(x+y)%17,.5].map(n=>format==='rgba16float'?fromHalf(toHalf(n)):n));for(let i=0;i<p.length;i++)assert.equal(p[i],expected[i]);const stats=await c.stats();assert.equal(stats.devicesCreated,1);assert.equal(stats.imageReadbacks,0);assert.equal(stats.pixelTransferBytes,0);assert.equal(stats.numericalValidationPasses,0);assert.ok(stats.allocatedImageBytes>=4097*4097*16);assert.equal(stats.capabilities.nativeImages.admission,'device-and-session-budget');assert.equal(stats.capabilities.nativeMesh.exactAdmission,'session-budget');assert.equal(stats.capabilities.nativeMesh.exactMaxTriangles,undefined);results.push({format,dimensions:[4097,4097],workingBytes:4097*4097*16,samples:p,stats});}finally{await c.close();await f.s.api.dispose();}}
 console.log(JSON.stringify({case:'dynamic-native-images',results}));
});

test('metadata uses U32 addressing and actual device limits, with separate texture attachment checks',()=>{
 const base=new NativeRecordingScope().api.capabilities(),device={...base,hardwareVerified:true,limits:{...base.limits,maxBufferSize:65536,maxStorageBufferBindingSize:32768,maxComputeWorkgroupsPerDimension:64},nativeImages:{version:1 as const,admission:'device-and-session-budget' as const,maxTextureDimension2D:16}};
 const wide=nativePixelInfo({...output,width:17,height:1},device);assert.throws(()=>nativeTextureInfo(wide,device),{code:'E_NATIVE_IMAGE_LIMIT'});assert.throws(()=>nativePixelInfo({...output,width:513,height:1},device),{code:'E_NATIVE_IMAGE_LIMIT'});assert.throws(()=>nativePixelInfo({...output,width:64,height:64},device),{code:'E_NATIVE_IMAGE_LIMIT'});
 for(const [width,height]of [[0,1],[1.5,2],[Infinity,2],[2**32,1]])assert.throws(()=>nativePixelInfo({...output,width,height}),{code:'E_GPU_PIXEL_CONTRACT'});assert.throws(()=>nativePixelInfo({...output,width:0x40000000,height:1}),{code:'E_NATIVE_IMAGE_LIMIT'});
});

test('actual Native admission distinguishes storage-only width from texture width and rejects device/session overflows',async()=>{
 const f=await fixture(1,1),c=await NativeGpuClient.create(f.program,{executable}),stats=await c.stats();await c.close();await f.s.api.dispose();const width=stats.capabilities.nativeImages.maxTextureDimension2D+1,wide=await fixture(width,1),client=await NativeGpuClient.create(wide.program,{executable});
 try{const t=await client.submit(0,wide.parameters);await t.completed;const values=(await client.inspectForTest(t.slot,wide.imageIndex)).pixels;assert.equal(values[4],(width-1)*.125);}finally{await client.close();await wide.s.api.dispose();}
 assert.throws(()=>nativeFrameCapacity(wide.program,100),{code:'E_NATIVE_BUDGET'});const budget=structuredClone(wide.program);budget.maxBytes=100;await assert.rejects(NativeGpuClient.create(budget,{executable}),{code:'E_NATIVE_BUDGET'});
 const operatorBudget=structuredClone(f.program);operatorBudget.maxBytes=8*1024**3;assert.ok(nativeFrameCapacity(operatorBudget,operatorBudget.maxBytes).capacity>0);const largerBudget=await NativeGpuClient.create(operatorBudget,{executable});try{assert.equal((await largerBudget.stats()).devicesCreated,1);}finally{await largerBudget.close();}assert.throws(()=>nativeFrameCapacity(operatorBudget,Number.MAX_SAFE_INTEGER+1),{code:'E_NATIVE_BUDGET'});
 const oversized=structuredClone(f.program);oversized.maxBytes=4*1024**3;oversized.images[0].width=Math.floor(stats.capabilities.limits.maxStorageBufferBindingSize/16)+1;oversized.passes[0].header[0]=oversized.images[0].width;oversized.passes[1].header[4]=oversized.images[0].width;await assert.rejects(NativeGpuClient.create(oversized,{executable}),{code:'E_NATIVE_BUDGET'});
 // A wide buffer is valid, but an equally wide render attachment is not.
 const s=new NativeRecordingScope(),g=s.api,positions=await g.createField({type:'f32',dimensions:[3,1,1],components:3,semantic:'position',space:'clip',units:'normalized'},Float32Array.of(-1,-1,.5,3,-1,.5,-1,3,.5));s.publish(await g.drawMesh({positions,output:{...output,width,height:1}}));const {parameters:_p,output:_o,external:_e,kernelOffset:_k,...packet}=s.packet(),mesh:NativeProgram={...packet,version:2,session:randomBytes(32).toString('hex'),slots:1,maxBytes:1024**3,display:null};await assert.rejects(NativeGpuClient.create(mesh,{executable}),{code:'E_NATIVE_IMAGE_LIMIT'});await g.dispose();
});
