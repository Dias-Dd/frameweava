import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import type {NativePluginInit} from '../src/plugins/sdk.ts';
import {sceneBindings} from '../modules/spatial-creation/scene-bindings.ts';
import {parseFunctionMetadata} from '../src/packages/function-metadata.ts';
import * as scene from '../modules/spatial-creation/rendering.ts';
import * as native from '../modules/native-gpu/authoring.ts';
import {createRefractiveScene} from '../modules/spatial-vfx/stage.ts';
import * as imageNode from '../modules/native-effects/authoring/node.ts';
import * as spatialNode from '../modules/spatial-creation/node.ts';
import {inspectExr} from '../src/media/ocio.ts';
import {pathAovChannels,writePathAovExr} from '../modules/native-gpu/path-aov.ts';
import {prepareNativeCharacterAsset} from '../modules/native-gpu/prepare-character.ts';
import {authoringEntrypoints} from '../src/capabilities/entrypoints.ts';
import {borrowNativeScope} from '../modules/native-gpu/borrow.ts';
import {registerNativeScope} from '../modules/native-gpu/provenance.ts';

test('domain facades preserve the exact implementation and host-only preparation boundary',()=>{
  assert.equal(scene.createNativeScene,native.createNativeScene);
  assert.equal(scene.createNativePathTracer,native.createNativePathTracer);
  assert.equal(scene.attachNativeCharacter,native.attachNativeCharacter);
  assert.equal(scene.createRefractiveScene,createRefractiveScene);
  assert.equal(imageNode.inspectExr,inspectExr);
  assert.equal(imageNode.pathAovChannels,pathAovChannels);
  assert.equal(imageNode.writePathAovExr,writePathAovExr);
  assert.equal(spatialNode.prepareNativeCharacterAsset,prepareNativeCharacterAsset);
  assert.ok(!('prepareNativeCharacterAsset' in scene));
  assert.ok(!('inspectExr' in scene));
});

test('managed scene factories borrow the admitted lease and dispose once after pending initialization',async()=>{
  let finish!:()=>void,disposed=0;const lease={capabilities:()=>({hardwareVerified:true})};
  const init={backend:'native-gpu',gpu:lease} as unknown as NativePluginInit;
  const gate=new Promise<void>(r=>{finish=r;});
  const bound=sceneBindings(init,{factory:async(value:unknown)=>{
    assert.equal((value as {gpu:unknown}).gpu,lease);await gate;
    return {dispose(){disposed++;}};
  }});
  const pending=bound.exports.factory({gpu:{foreign:true}}) as Promise<{dispose():Promise<unknown>}>;
  const closing=bound.dispose();finish();const instance=await pending;await closing;
  await instance.dispose();await bound.dispose();assert.equal(disposed,1);
  assert.throws(()=>bound.exports.factory({}),{code:'E_PACKAGE_DISPOSE'});
  assert.throws(()=>sceneBindings({backend:'native-gpu'} as NativePluginInit,{}),{code:'E_PACKAGE_CAPABILITY'});
});

test('scene cleanup failures remain visible and are not retried',async()=>{
  const failure=new Error('fixture cleanup failure');let count=0;
  const bound=sceneBindings({backend:'native-gpu',gpu:{capabilities:()=>({hardwareVerified:true})}} as unknown as NativePluginInit,
    {factory:async()=>({dispose(){count++;throw failure;}})});
  const instance=await bound.exports.factory() as {dispose():Promise<unknown>};
  await assert.rejects(instance.dispose(),error=>error===failure);
  await assert.rejects(bound.dispose(),error=>error===failure);assert.equal(count,1);
});

test('new releases ship descriptions, examples, contracts and Node workflow discovery',async()=>{
  for(const file of ['modules/spatial-creation/scene-functions.json','modules/native-effects/exr-functions.json']){
    const functions=parseFunctionMetadata(await readFile(file,'utf8'),file);
    assert.ok(functions.length);assert.ok(functions.every(f=>f.level==='authoring'&&f.contract&&f.example));
  }
  assert.ok(authoringEntrypoints('EXR').some(e=>e.name==='inspectExr'));
  assert.ok(authoringEntrypoints('AOV').some(e=>e.name==='writePathAovExr'));
  assert.ok(authoringEntrypoints('gltf').some(e=>e.name==='prepareNativeCharacterAsset'));
  const image=JSON.parse(await readFile('modules/native-effects/frameweave.package.json','utf8'));
  assert.equal(image.version,'0.8.0');assert.ok(image.bindings.gpuExports.includes('exrResource'));
});

test('managed ray results adopt only newly allocated buffers, never foreign supplied targets',async()=>{
  const released:unknown[]=[];
  const output={hits:{id:1},measurements:{id:2},normals:{id:3}};
  const owner={traceRayScene:async()=>output,release:async()=>{},releaseModule:async()=>{},releaseBuffer:async(v:unknown)=>{released.push(v);},
    capabilities:()=>({}),stats:()=>({}),timings:()=>({})} as unknown as native.NativeGpuScope;
  registerNativeScope(owner,{backend:'native-wgpu',hardwareVerified:true,owner:'a'.repeat(64),version:1,
    capabilities:{backend:'native-wgpu',hardwareVerified:true}} as never);
  const lease=borrowNativeScope(owner);
  await lease.scope.traceRayScene({} as never,{version:1} as never);
  await lease.scope.releaseBuffer(output.hits as never);
  await lease.dispose();assert.equal(released.length,3);
  const foreign=borrowNativeScope(owner);
  await foreign.scope.traceRayScene({} as never,{version:1,output} as never);
  await assert.rejects(foreign.scope.releaseBuffer(output.hits as never),{code:'E_NATIVE_RESOURCE_OWNER'});
  await foreign.dispose();assert.equal(released.length,3);
});
