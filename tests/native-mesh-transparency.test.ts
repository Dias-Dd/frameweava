import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {resolve} from 'node:path';
import {NativeRecordingScope} from '../modules/native-gpu/scope.ts';
import {NativeGpuClient,type NativeProgram} from '../modules/native-gpu/client.ts';
import type {NativeMeshRaster} from '../modules/native-gpu/authoring.ts';
import {nativeFrameCapacity} from '../modules/native-gpu/memory.ts';
import {linear709,surfaceFromPixels,pixelsFromSurface,toHalf,fromHalf,type AlphaMode} from '../src/media/surface.ts';
const executable=resolve('.frameweave/native-target/debug/frameweave-native-gpu.exe');
type Triangle={z:[number,number,number];color:[number,number,number,number]};
const nearZero:Triangle={z:[.1,.1,.1],color:[0,7,-3,0]},red:Triangle={z:[.7,.7,.7],color:[4,-1,2,1]};
const xy=[[-1,-1],[3,-1],[-1,3]],half=(n:number)=>fromHalf(toHalf(n));
async function fixture(triangles:Triangle[],raster:NativeMeshRaster|undefined,format:'rgba16float'|'rgba32float'='rgba32float',inputAlpha:AlphaMode='straight',outputAlpha:'straight'|'premultiplied'='premultiplied',indexed=false){
 const scope=new NativeRecordingScope(),g=scope.api,values=Float32Array.from(triangles.flatMap(t=>t.color));
 for(let i=0;i<triangles.length;i++){if(inputAlpha==='premultiplied')for(let j=0;j<3;j++)values[i*4+j]*=values[i*4+3];else if(inputAlpha==='opaque')values[i*4+3]=1;}
 const source=surfaceFromPixels(triangles.length,1,values,{format,color:linear709,alpha:inputAlpha}),pixels=pixelsFromSurface(source),positions=await g.createField({type:'f32',dimensions:[triangles.length*3,1,1],components:3,semantic:'position',space:'clip',units:'normalized'},Float32Array.from(triangles.flatMap(t=>xy.flatMap((v,i)=>[...v,t.z[i]])))),uvs=await g.createField({type:'f32',dimensions:[triangles.length*3,1,1],components:2,semantic:'generic'},Float32Array.from(triangles.flatMap((_,i)=>Array.from({length:3},()=>[(i+.5)/triangles.length,.5]).flat()))),indices=indexed?await g.createBuffer({type:'u32',length:triangles.length*3},Uint32Array.from(Array.from({length:triangles.length*3},(_,i)=>i))):undefined,image=await g.upload(source);
 scope.publish(await g.drawMesh({positions,indices,texture:{version:1,image,uvs,filter:'nearest'},raster,output:{width:16,height:8,format,alpha:outputAlpha,color:linear709}}));await g.release(image);await g.releaseBuffer(uvs);await g.releaseBuffer(positions);if(indices)await g.releaseBuffer(indices);
 const {output,parameters,external:_e,kernelOffset:_k,...p}=scope.packet(),program:NativeProgram={...p,version:2,session:randomBytes(32).toString('hex'),slots:1,maxBytes:32*1024**2,display:null};
 const expected=new Float32Array(16*8*4);
 for(let y=0;y<8;y++)for(let x=0;x<16;x++){
  const ndcX=(x+.5)/16*2-1,ndcY=1-(y+.5)/8*2,wx=(ndcX+1)/4,wy=(ndcY+1)/4,l=[1-wx-wy,wx,wy];
  let fragments=triangles.map((t,i)=>{const c=Array.from(pixels.slice(i*4,i*4+4));if(inputAlpha==='straight')for(let j=0;j<3;j++)c[j]*=c[3];const z=l.reduce((n,v,j)=>n+v*Math.fround(t.z[j]),0);return {c,z,id:i};});
  let result=[0,0,0,0];
  if(!raster||raster.mode==='cutout'){fragments=fragments.filter(f=>!raster||f.c[3]>(raster.alphaCutoff??.5));fragments.sort((a,b)=>a.z-b.z||b.id-a.id);result=fragments[0]?.c??result;}
  else if(raster.mode==='source-over'){for(const f of fragments)result=f.c.map((v,j)=>v+result[j]*(1-f.c[3]));}
  else{fragments=fragments.filter(f=>f.c[3]>0).sort((a,b)=>a.z-b.z||b.id-a.id);let transmission=1;for(const f of fragments){result=result.map((v,j)=>v+f.c[j]*transmission);transmission*=1-f.c[3];}}
  if(outputAlpha==='straight'){if(result[3]===0)result=[0,0,0,0];else for(let j=0;j<3;j++)result[j]/=result[3];}for(let j=0;j<4;j++)expected[(y*16+x)*4+j]=format==='rgba16float'?half(result[j]):result[j];
 }return {scope,program,parameters,output,expected};
}
function compare(actual:number[],expected:Float32Array,format:string){let maxScaled=0;assert.equal(actual.length,expected.length);for(let i=0;i<actual.length;i++){const error=Math.abs(actual[i]-expected[i]),scaled=error/(1+Math.abs(expected[i]));maxScaled=Math.max(maxScaled,scaled);const bound=format==='rgba16float'?Math.max(2**-24,2**(Math.floor(Math.log2(Math.max(Math.abs(expected[i]),2**-14)))-10))*1.001:3e-6*(1+Math.abs(expected[i]));assert.ok(error<=bound,`component ${i}: ${actual[i]} / ${expected[i]}, error ${error} > ${bound}`);}return maxScaled;}
async function verify(f:Awaited<ReturnType<typeof fixture>>,format='rgba32float'){
 const c=await NativeGpuClient.create(f.program,{executable});try{const first=await c.submit(0,f.parameters);await first.completed;const a=(await c.inspectForTest(first.slot,f.output)).pixels;const maxScaled=compare(a,f.expected,format);for(const frame of [8,0]){const t=await c.submit(frame,f.parameters);await t.completed;assert.deepEqual((await c.inspectForTest(t.slot,f.output)).pixels,a);}const stats=await c.stats();for(const k of ['imageReadbacks','pixelTransferBytes','frameHashes','numericalValidationPasses','blockingGpuWaits'])assert.equal(stats[k],0);assert.equal(stats.devicesCreated,1);return {maxScaled,stats};}finally{await c.close();await f.scope.api.dispose();}
}

test('raster v1 fixes alpha-zero depth holes; omitted mode preserves old replacement',async()=>{
 const errors=[];for(const raster of [undefined,{version:1,mode:'cutout',alphaCutoff:0},{version:1,mode:'source-over',order:'back-to-front'},{version:1,mode:'depth-peel'}] as (NativeMeshRaster|undefined)[]){const f=await fixture([red,nearZero],raster);errors.push({mode:raster?.mode??'replace',...await verify(f)});}console.log(JSON.stringify({case:'alpha-zero-depth',errors}));
});

test('exact peeling handles crossing depth, HDR/negative RGB, Alpha representations and F16/F32 without sorting',async()=>{
 const triangles:Triangle[]=[{z:[.2,.8,.2],color:[4000,-2000,8,.25]},{z:[.6,0,.6],color:[-2000,1000,-4,.5]},nearZero],results=[];
 for(const format of ['rgba32float','rgba16float'] as const)for(const input of ['straight','premultiplied','opaque'] as AlphaMode[])for(const output of ['straight','premultiplied'] as const){const f=await fixture(triangles,{version:1,mode:'depth-peel'},format,input,output,true);results.push({format,input,output,...await verify(f,format)});}
 const f=await fixture([triangles[1],triangles[0],nearZero],{version:1,mode:'depth-peel'});results.push({format:'rgba32float',input:'reversed',output:'premultiplied',...await verify(f)});console.log(JSON.stringify({case:'crossing-transparent',results}));
});

test('cutout threshold, sorted PM over, coplanar tie order and opaque early completion have CPU references',async()=>{
 const results=[];const a:Triangle={z:[.5,.5,.5],color:[4,-.5,2,.5]},b:Triangle={z:[.5,.5,.5],color:[-1,2,-4,.75]};
 for(const [triangles,raster]of [[[a,b,nearZero],{version:1,mode:'cutout',alphaCutoff:.5}],[[a,b,nearZero],{version:1,mode:'source-over',order:'back-to-front'}],[[a,b,nearZero],{version:1,mode:'depth-peel'}],[[{...red,z:[.2,.2,.2]},...Array.from({length:32},()=>({...b,z:[.8,.8,.8] as [number,number,number]}))],{version:1,mode:'depth-peel'}]] as [Triangle[],NativeMeshRaster][]){const f=await fixture(triangles,raster);results.push({mode:raster.mode,...await verify(f)});}console.log(JSON.stringify({case:'raster-profiles',results}));
});

test('raster options and actual frame budgets reject invalid or lossy configurations without a triangle-count cap',async()=>{
 const f=await fixture([red],{version:1,mode:'depth-peel'}),g=f.scope.api,positions=await g.createField({type:'f32',dimensions:[771,1,1],components:3,semantic:'position',space:'clip',units:'normalized'},new Float32Array(2313));const base={positions,count:3,output:{width:2,height:2,format:'rgba32float' as const,alpha:'premultiplied' as const,color:linear709}};
 for(const raster of [{version:2,mode:'cutout'},{version:1,mode:'source-over'},{version:1,mode:'depth-peel',layers:1},{version:1,mode:'cutout',alphaCutoff:NaN},{version:1,mode:'source-over',order:'front-to-back'}])await assert.rejects(g.drawMesh({...base,raster:raster as NativeMeshRaster}),{code:'E_NATIVE_SCOPE'});
 // Keep this packet unchanged for its malformed-admission checks. The next
 // separate GPU case proves successful execution above the former count cap.
 assert.throws(()=>nativeFrameCapacity(f.program,200),{code:'E_NATIVE_BUDGET'});
 for(const mutate of [(p:NativeProgram)=>{p.passes.at(-1)!.header[11]=2;},(p:NativeProgram)=>{p.kernels.at(-1)!.meshMode='other' as 'cutout';},(p:NativeProgram)=>{p.maxBytes=200;}]){const p=structuredClone(f.program);mutate(p);await assert.rejects(NativeGpuClient.create(p,{executable}),e=>/^E_NATIVE_(MESH|BUDGET)$/.test((e as {code:string}).code));}await g.dispose();
});

test('exact peeling executes more than the former 256-triangle cap, retaining opaque occlusion',async()=>{
 const front:Triangle={z:[.1,.1,.1],color:[4,-1,2,1]},behind:Triangle={z:[.8,.8,.8],color:[-1,3,8,.5]};await verify(await fixture([front,...Array.from({length:256},()=>behind)],{version:1,mode:'depth-peel'}));
});

test('flat materials and concurrent exact frame slots retain Alpha and separate per-frame accumulators',async()=>{
 for(const mode of ['cutout','source-over','depth-peel'] as const){
  const s=new NativeRecordingScope(),g=s.api,positions=await g.createField({type:'f32',dimensions:[6,1,1],components:3,semantic:'position',space:'clip',units:'normalized'},Float32Array.of(-1,-1,.7,3,-1,.7,-1,3,.7,-1,-1,.3,3,-1,.3,-1,3,.3)),raster:NativeMeshRaster=mode==='source-over'?{version:1,mode,order:'back-to-front'}:mode==='cutout'?{version:1,mode,alphaCutoff:.4}:{version:1,mode};
  s.publish(await g.drawMesh({positions,color:[4,-1,2,.5],raster,output:{width:4,height:2,format:'rgba32float',alpha:'straight',color:linear709}}));const {parameters,output,external:_e,kernelOffset:_k,...p}=s.packet(),program:NativeProgram={...p,version:2,session:randomBytes(32).toString('hex'),slots:3,maxBytes:1024**2,display:null},c=await NativeGpuClient.create(program,{executable});
  try{const tickets=await c.submitBatch([0,4,9].map(frame=>({frame,parameters})));assert.equal(new Set(tickets.map(t=>t.slot)).size,3);await Promise.all(tickets.map(t=>t.completed));for(const t of tickets){const pixels=(await c.inspectForTest(t.slot,output)).pixels;for(let i=0;i<pixels.length;i+=4)assert.deepEqual(pixels.slice(i,i+4),[4,-1,2,mode==='cutout'?.5:.75]);}const stats=await c.stats();assert.equal(stats.imageReadbacks,0);assert.equal(stats.devicesCreated,1);}finally{await c.close();await c.close();await g.dispose();}
 }
});

test('exact transmittance preserves HDR behind almost-opaque layers and tiny nonzero Alpha',async()=>{
 const nearly:Triangle={z:[.2,.2,.2],color:[0,0,0,1-2**-24]},back:Triangle={z:[.9,.9,.9],color:[1e20,-1e20,4,1]};
 await verify(await fixture([back,{...nearly,z:[.6,.6,.6]},{...nearly,z:[.4,.4,.4]},nearly],{version:1,mode:'depth-peel'}));
 const tiny:Triangle={z:[.5,.5,.5],color:[4,-1,2,1e-8]};const f=await fixture([tiny],{version:1,mode:'depth-peel'},'rgba32float','straight','straight');assert.ok(f.expected[3]>0);await verify(f);
});

test('actual device capability is required for the fast F32 blending path',async()=>{
 const recorder=new NativeRecordingScope(),s=new NativeRecordingScope({version:1,backend:'native-wgpu',owner:'a'.repeat(64),hardwareVerified:true,capabilities:{...recorder.api.capabilities(),hardwareVerified:true,...{nativeMesh:{version:1,float32Blendable:false,exactMaxTriangles:256}}}}),g=s.api,positions=await g.createField({type:'f32',dimensions:[3,1,1],components:3,semantic:'position',space:'clip',units:'normalized'},Float32Array.of(-1,-1,.5,3,-1,.5,-1,3,.5));
 await assert.rejects(g.drawMesh({positions,raster:{version:1,mode:'source-over',order:'back-to-front'},output:{width:2,height:2,format:'rgba32float',alpha:'premultiplied',color:linear709}}),{code:'E_NATIVE_MESH_CAPABILITY'});assert.equal(g.stats().runs,0);await g.dispose();await recorder.api.dispose();
});

test('PM Alpha-zero RGB emission survives ordered and exact rasterization, including HDR and opaque backdrop',async()=>{
 for(const mode of ['source-over','depth-peel'] as const)for(const format of ['rgba32float','rgba16float'] as const){
  const s=new NativeRecordingScope(),g=s.api,positions=await g.createField({type:'f32',dimensions:[6,1,1],components:3,semantic:'position',space:'clip',units:'normalized'},Float32Array.of(-1,-1,.7,3,-1,.7,-1,3,.7,-1,-1,.3,3,-1,.3,-1,3,.3)),uvs=await g.createField({type:'f32',dimensions:[6,1,1],components:2,semantic:'generic'},Float32Array.of(.25,.5,.25,.5,.25,.5,.75,.5,.75,.5,.75,.5)),source=await g.upload(surfaceFromPixels(2,1,[4,-1,2,1,-.125,3,.25,0],{format,alpha:'premultiplied',color:linear709}));
  const raster:NativeMeshRaster=mode==='source-over'?{version:1,mode,order:'back-to-front'}:{version:1,mode},emissionUVs=await g.createField({type:'f32',dimensions:[3,1,1],components:2,semantic:'generic'},Float32Array.of(.75,.5,.75,.5,.75,.5));await g.drawMesh({positions,count:3,texture:{version:1,image:source,uvs:emissionUVs,filter:'nearest'},raster,output:{width:2,height:1,format,alpha:'premultiplied',color:linear709}});s.publish(await g.drawMesh({positions,texture:{version:1,image:source,uvs,filter:'nearest'},raster,output:{width:2,height:1,format,alpha:'premultiplied',color:linear709}}));const {parameters,output,external:_e,kernelOffset:_k,...p}=s.packet(),c=await NativeGpuClient.create({...p,version:2,session:randomBytes(32).toString('hex'),slots:1,maxBytes:1024**2,display:null},{executable});try{const t=await c.submit(0,parameters);await t.completed;const pixels=(await c.inspectForTest(t.slot,output)).pixels;assert.deepEqual(pixels,[3.875,2,2.25,1,3.875,2,2.25,1]);const solo=p.passes.find(v=>v.draw)!.output;assert.deepEqual((await c.inspectForTest(t.slot,solo)).pixels,[-.125,3,.25,0,-.125,3,.25,0]);}finally{await c.close();await g.dispose();}
 }
});
