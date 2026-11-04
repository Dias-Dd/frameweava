import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {resolve} from 'node:path';
import {NativeRecordingScope} from '../modules/native-gpu/scope.ts';
import {NativeGpuClient,type NativeProgram} from '../modules/native-gpu/client.ts';
import {residentLayout} from '../modules/native-gpu/memory.ts';
import {createStatisticsFilters} from '../modules/gpu-image-effects/resident/foundations/statistics.ts';
import {evaluate,quantize} from '../modules/gpu-image-effects/resident/foundations/reference.ts';
import {linear709} from '../src/media/surface.ts';
const executable=resolve('.frameweave/native-target/debug/frameweave-native-gpu.exe');
const code='fn pixel(p:vec2u)->vec4f{let n=p.x+17u*p.y;let a=select(select(.5,1.,n%3u==1u),0.,n%3u==2u);return vec4f((f32(p.x)/8.-.5)*a,(f32(p.y)/4.-.25)*a,(.125+f32(n%7u)/8.)*a,a);}';
function plan(s:NativeRecordingScope){const {parameters,output,external:_e,kernelOffset:_k,moduleOffset:_m,...p}=s.packet();const program:NativeProgram={...p,version:2,session:randomBytes(32).toString('hex'),slots:1,maxBytes:64*1024**2,display:null};program.imageAllocations=residentLayout(program).mapping;return {program,parameters,output};}
test('image data v1 is owner-local, read-only, preserves source metadata, and extends allocation lifetime',async()=>{
 const s=new NativeRecordingScope(),g=s.api,k=await g.compile({abiVersion:1,id:'test/image-view',version:'1.0.0',inputCount:0,parameterWords:0,code});
 const i=await g.run(k,[],{output:{width:17,height:9,format:'rgba16float',alpha:'premultiplied',color:linear709}}),view=await g.imageToBuffer!(i,{version:1});
 assert.equal(view.info.readOnly,true);assert.equal(view.info.length,17*9*4);assert.deepEqual((view.info.metadata as any).color,linear709);assert.equal((view.info.metadata as any).format,'rgba16float');
 await assert.rejects(g.writeBuffer(view,new Float32Array([0])),{code:'E_NATIVE_SCOPE'});await assert.rejects(g.clearBuffer(view),{code:'E_NATIVE_SCOPE'});
 const before=g.stats().runs;const compute=await g.compileCompute({abiVersion:1,id:'test/forbidden-view-store',version:'1.0.0',bindings:[{type:'f32',access:'read_write'}],workgroupSize:[1,1,1],parameterWords:0,code:'fn compute(g:vec3u,l:vec3u,w:vec3u){store0(0u,0.);}'});
 await assert.rejects(g.dispatch(compute,[view],{workItems:[1,1,1]}),{code:'E_NATIVE_SCOPE'});assert.equal(g.stats().runs,before);
 await g.release(i);const copy=await g.cloneBuffer(view);assert.equal(copy.info.readOnly,undefined);await g.releaseBuffer(view);await assert.rejects(g.cloneBuffer(view),{code:'E_NATIVE_SCOPE'});await g.dispose();
});
test('all four existing automatic statistics run without pixel transfers and match independent F64 references',async()=>{
 for(const format of ['rgba32float','rgba16float'] as const)for(const name of ['autoLevels','autoContrast','autoColor','equalize'] as const){
  const s=new NativeRecordingScope(),g=s.api,k=await g.compile({abiVersion:1,id:'test/statistics-source',version:'1.0.0',inputCount:0,parameterWords:0,code});
  const input=await g.run(k,[],{output:{width:17,height:9,format,alpha:'premultiplied',color:linear709}}),o=name==='equalize'?{bins:16,amount:.75,format}:{amount:.75,format};
  const result=await createStatisticsFilters(g)[name](input,o);s.publish(result);const {program,parameters,output}=plan(s),client=await NativeGpuClient.create(program,{executable});
  try{const t=await client.submit(0,parameters);await t.completed;const actual=(await client.inspectForTest(t.slot,output)).pixels;
   const pixels=Float32Array.from({length:17*9*4},(_,i)=>{const n=i>>2,x=n%17,y=Math.floor(n/17),a=[.5,1,0][n%3];return [(x/8-.5)*a,(y/4-.25)*a,(.125+n%7/8)*a,a][i%4];});const source=quantize(pixels,format==='rgba16float'),expected=quantize(evaluate(name,{width:17,height:9,pixels:source},{amount:.75,bins:16}),format==='rgba16float');
   let maxScaled=0;for(let i=0;i<actual.length;i++){const delta=Math.abs(actual[i]-expected[i]),scale=Math.max(1,Math.abs(expected[i]));maxScaled=Math.max(maxScaled,delta/scale);assert.ok(delta/scale<=(format==='rgba16float'?2**-10:3e-6),JSON.stringify({name,format,i,actual:actual[i],expected:expected[i]}));}
   const stats=await client.stats();assert.equal(stats.imageReadbacks,0);assert.equal(stats.pixelTransferBytes,0);assert.equal(stats.devicesCreated,1);console.log(JSON.stringify({name,format,maxScaled,stats}));
   const forged=structuredClone(program),viewIndex=forged.data!.findIndex(d=>d.sourceImage!==undefined),pass=forged.passes.find(p=>p.buffers?.includes(viewIndex))!,binding=pass.buffers!.indexOf(viewIndex);forged.kernels[pass.kernel].code=forged.kernels[pass.kernel].code.replace(`@binding(${binding}) var<storage,read>`,`@binding(${binding}) var<storage,read_write>`);
   await assert.rejects(NativeGpuClient.create(forged,{executable}),{code:'E_NATIVE_DATA'});
  }finally{await client.close();await g.dispose();}
 }
});
