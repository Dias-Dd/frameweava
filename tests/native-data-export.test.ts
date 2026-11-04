import {nativeExecutable} from '../modules/native-gpu/executable.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {resolve} from 'node:path';
import {access,readdir} from 'node:fs/promises';
import {NativeRecordingScope} from '../modules/native-gpu/scope.ts';
import {NativeGpuClient,type NativeProgram} from '../modules/native-gpu/client.ts';
import {NativeBufferExporter,exportedPositions} from '../modules/native-gpu/data-export.ts';
import {linear709} from '../src/media/surface.ts';
test('named production buffer export is explicit, owner-bound, generation-bound, and cleaned after reading',async()=>{
 process.env.FRAMEWEAVE_HOME=resolve('.frameweave/user-home');const s=new NativeRecordingScope(),g=s.api;
 const positions=await g.createField({type:'f32',dimensions:[2,1,1],components:3,semantic:'position',space:'world',units:'meter'},Float32Array.of(1,-.25,4,2,.5,-1));
 const k=await g.compile({abiVersion:1,id:'test/export-buffer',version:'1.0.0',inputCount:0,parameterWords:0,code:'fn pixel(p:vec2u)->vec4f{return vec4f(2.,-.25,4.,1.);}'});s.sealInitialization();s.beginFrame();await g.publishBuffer('positions',positions,{version:1});s.publish(await g.run(k,[],{output:{width:4,height:2,format:'rgba32float',alpha:'opaque',color:linear709}}));
 const {parameters,output:_o,external:_e,kernelOffset:_k,moduleOffset:_m,...p}=s.packet(),program:NativeProgram={...p,version:2,session:randomBytes(32).toString('hex'),slots:2,maxBytes:1024**2,display:null},exporter=await NativeBufferExporter.create();exporter.configure(program);
 const client=await NativeGpuClient.create(program,{executable:await nativeExecutable()});
 try{const a=await client.submit(0,parameters);await a.completed;assert.equal((await client.stats()).bufferExports.readbacks,0);const value=await exporter.read(client,a,'positions');assert.deepEqual(exportedPositions(value),[[1,-.25,4],[2,.5,-1]]);assert.deepEqual(await readdir(exporter.lease.directory),[]);
  await assert.rejects(exporter.read(client,{...a},'positions'),{code:'E_NATIVE_DATA_TICKET'});await assert.rejects(exporter.read(client,a,'missing'),{code:'E_NATIVE_DATA_OUTPUT'});await assert.rejects(client.exportBuffer(a,'positions','../escape.f32'),{code:'E_NATIVE_BRIDGE'});
  const batch=await client.submitBatch([{frame:0,parameters},{frame:1,parameters}]);await Promise.all(batch.map(t=>t.completed));assert.notEqual(a.publication,batch[0].publication);await assert.rejects(exporter.read(client,a,'positions'),{code:'E_NATIVE_DATA_STALE'});assert.deepEqual(exportedPositions(await exporter.read(client,batch[1],'positions')),[[1,-.25,4],[2,.5,-1]]);assert.equal((await client.stats()).bufferExports.readbacks,2);
  await assert.rejects(g.readBuffer(positions),{code:'E_NATIVE_SCOPE'});await exporter.close();await exporter.close();await assert.rejects(access(exporter.lease.directory));console.log(JSON.stringify({case:'named-data-export-v1',stats:await client.stats()}));
 }finally{await client.close();await exporter.close();await g.dispose();}
});
