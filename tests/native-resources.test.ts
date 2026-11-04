import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readFile,appendFile,access} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {buildProject} from '../src/compiler/build.ts';
import {NativeResourceImages} from '../modules/native-gpu/resource-images.ts';
import {NativeRecordingScope} from '../modules/native-gpu/scope.ts';
import {NativeGpuClient,type NativeProgram} from '../modules/native-gpu/client.ts';
import {surfaceFromPixels,linear709} from '../src/media/surface.ts';
test('declared HDR resource imports verified bytes once and produces exact GPU pixels without frame transport',async()=>{
 process.env.FRAMEWEAVE_HOME=resolve('.frameweave/user-home');const base=resolve('.frameweave/native-resource-tests');await mkdir(base,{recursive:true});const dir=await mkdtemp(join(base,'p-')),entry=join(dir,'scene.tsx');
 const pixels=Float32Array.from({length:8*4*4},(_,i)=>[2,-.25,4,.5][i%4]);await writeFile(join(dir,'surface.json'),JSON.stringify(surfaceFromPixels(8,4,pixels,{format:'rgba32float',color:linear709,alpha:'premultiplied'})));
 await writeFile(entry,`import {Composition,Stage,Layer,Resource,ref} from '@frameweave/engine';import {defineNativeStage} from '@frameweave/engine/native';import {linear709} from '@frameweave/engine/native';export const image=defineNativeStage(init=>({renderAt(){return init.gpu.importResource({version:1,id:'source',decode:'surface-v2',output:{width:8,height:4,format:'rgba32float',alpha:'premultiplied',color:linear709}});}}));export default <Composition width={8} height={4} fps={24} durationInFrames={4} background="transparent"><Resource id="source" src="./surface.json" kind="file"/><Stage id="image" factory={image}/><Layer source={ref('image')}/></Composition>;`);
 const build=await buildProject(entry),adapter=await NativeResourceImages.create(build),s=new NativeRecordingScope(),gpu=s.api,request={version:1 as const,id:'source',decode:'surface-v2' as const,output:{width:8,height:4,format:'rgba32float' as const,alpha:'premultiplied' as const,color:linear709}};
 try{const a=await adapter.image(request);assert.equal(await adapter.image(request),a);await assert.rejects(adapter.image({...request,id:'undeclared'}),{code:'E_NATIVE_RESOURCE_UNDECLARED'});
  const input=await gpu.importResource(request),copy=await gpu.compile({abiVersion:1,id:'test/resource-copy',version:'1.0.0',inputCount:1,parameterWords:0,code:'fn pixel(p:vec2u)->vec4f{return read0(vec2i(p));}'});s.publish(await gpu.run(copy,[input]));const {parameters,output,resourceImages:_r,external:_e,kernelOffset:_k,moduleOffset:_m,...packet}=s.packet();const p:NativeProgram={...packet,version:2,session:randomBytes(32).toString('hex'),slots:1,maxBytes:1024**2,display:null,imports:[{image:0,file:a,source:'declared-resource'}]};adapter.configure(p);const client=await NativeGpuClient.create(p,{executable:resolve('.frameweave/native-target/debug/frameweave-native-gpu.exe')});
  try{for(const frame of [0,3,0]){const t=await client.submit(frame,parameters);await t.completed;assert.deepEqual((await client.inspectForTest(t.slot,output)).pixels,Array.from(pixels));}const stats=await client.stats();assert.equal(stats.resourceImports.uploadBytes,pixels.byteLength);assert.equal(Object.hasOwn(stats,'webBridge'),false);assert.equal(stats.imageReadbacks,0);console.log(JSON.stringify({case:'declared-resource',stats}));}finally{await client.close();}
  const changed=await NativeResourceImages.create(build);await appendFile(build.assets[build.manifest.resources.find(r=>r.id==='source')!.src],' ');try{await assert.rejects(changed.image(request),{code:'E_NATIVE_RESOURCE_INTEGRITY'});}finally{await changed.close();}
 }finally{await adapter.close();await adapter.close();await assert.rejects(access(adapter.lease.directory));await gpu.dispose();}
});
test('small explicit CPU Surface upload preserves HDR and has a clear large-value diagnostic',async()=>{
 const s=new NativeRecordingScope(),g=s.api,i=await g.upload(surfaceFromPixels(2,1,[2,-.25,4,.5,1,0,0,1],{format:'rgba32float',alpha:'premultiplied',color:linear709}));s.publish(i);assert.equal(s.packet().passes.length,1);await assert.rejects(g.upload(surfaceFromPixels(256,256,new Float32Array(256*256*4),{format:'rgba32float',color:linear709})),{code:'E_NATIVE_UPLOAD_LIMIT'});await g.dispose();
});
