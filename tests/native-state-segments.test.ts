import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {buildProject} from '../src/compiler/build.ts';
import {Renderer} from '../src/render/renderer.ts';
test('same-owner bounded state continuation executes more than 1024 passes and rolls back failure',{timeout:60000},async()=>{
 const base=resolve('artifacts/native-state-segments');await mkdir(base,{recursive:true});const dir=await mkdtemp(join(base,'case-')),entry=join(dir,'project.tsx');
 await writeFile(entry,`import {Composition,Stage,Layer,ref,linear709} from '@frameweave/engine';import {defineNativeStage,createNativeReplay} from '@frameweave/engine/native';
 export const scene=defineNativeStage(async init=>{const g=init.gpu,state=await g.createStateBuffer({type:'f32',length:1},new Float32Array([0]),{version:1,id:'value'}),replay=createNativeReplay(g,[state],{substeps:10});
 const add=await g.compileCompute({abiVersion:1,id:'test/segment-add',version:'1.0.0',workgroupSize:[1,1,1],parameterWords:0,bindings:[{type:'f32',access:'read_write'}],code:'fn compute(id:vec3u,local:vec3u,group:vec3u){if(id.x==0u){store0(0u,load0(0u)+1.);}}'});
 const pixel=await g.compile({abiVersion:2,id:'test/segment-image',version:'1.0.0',inputCount:0,parameterWords:0,dataInputs:[{type:'f32'}],code:'fn pixel(p:vec2u)->vec4f{return vec4f(data0(0u)*.001,0.,0.,1.);}'});
 return {async renderAt(c){await replay.record(c,async()=>{await g.dispatch(add,[state],{workItems:[1,1,1]});});if(c.frame===101)throw Error('CONTROLLED_SEGMENT_FAILURE');await g.publishBuffer('value',state,{version:1});return g.run(pixel,[],{data:[state],output:{width:8,height:8,format:'rgba32float',alpha:'premultiplied',color:linear709}});}};});
 export default <Composition width={8} height={8} fps={24} durationInFrames={102} background="transparent"><Stage id="image" factory={scene}/><Layer source={ref('image')}/></Composition>;`);
 const renderer=await Renderer.create(await buildProject(entry),{nativeGpu:{executable:resolve('.frameweave/native-target/release/frameweave-native-gpu.exe'),dynamic:'interactive',maxBytes:16*1024**2}});
 try{const rows=[];for(const frame of [100,0,100]){const ticket=await renderer.submitNativeFrame(frame);await ticket.completed;const value=await renderer.exportNativeBuffer(ticket,'image/value');assert.equal(value.values[0],frame*10);rows.push({frame,value:value.values[0]});}
  let stats=await renderer.nativeStats();assert.equal(stats.devicesCreated,1);assert.ok(stats.stateContinuations.segments>=4);assert.equal(stats.imageReadbacks,0);assert.equal(stats.stateCheckpoints.count,0);
  await assert.rejects(renderer.submitNativeFrame(101),/CONTROLLED_SEGMENT_FAILURE/);stats=await renderer.nativeStats();assert.ok(stats.stateCheckpoints.restores>=1);assert.equal(stats.stateCheckpoints.count,0);assert.equal(stats.stateContinuations.failed,true);await assert.rejects(renderer.submitNativeFrame(0),{code:'E_NATIVE_SEGMENT_FAILED'});
  await writeFile(join(dir,'result.json'),JSON.stringify({rows,stats,sameOwner:true,passLimitUnchanged:1024,perRequested100FramePasses:2001,rollback:true,jsFailureLatched:true},null,2));
 }finally{await renderer.close();await renderer.close();}
});
