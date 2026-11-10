import test from 'node:test';
import assert from 'node:assert/strict';
import {bounded} from '../modules/graphics-contracts/check.ts';
import {validateMeshData} from '../modules/graphics-contracts/validate.ts';
import {sha256,verifyResource} from '../modules/graphics-contracts/resources.ts';
import {importGltfCharacter} from '../modules/spatial-creation/character-import.ts';
import {attachNativeCharacter} from '../modules/native-gpu/scene-character.ts';
import {NativeRecordingScope} from '../modules/native-gpu/scope.ts';
import {characterDocument} from '../modules/spatial-creation/character-animation.ts';

test('Graphics accepts data beyond former aggregate, array, string, depth and vertex budgets',()=>{
  bounded(Array.from({length:1001},()=>Array(500).fill(0)));
  bounded('x'.repeat(65537));
  let deep:object={};for(let i=0;i<10000;i++)deep={child:deep};bounded(deep);
  const mesh=validateMeshData({schema:'frameweave.mesh',version:1,id:'large',coordinates:{spaceId:'local',unit:'meter',origin:'local',x:'right',y:'up',z:'toward-viewer',handedness:'right'},topology:'triangles',vertexIds:Array.from({length:16385},(_,i)=>'v'+i),restPositions:Array.from({length:16385},(_,i)=>[i,0,0]),indices:Array.from({length:116004},(_,i)=>i%3)});
  assert.equal(mesh.vertexIds.length,16385);assert.equal(mesh.indices.length,116004);
  assert.throws(()=>validateMeshData({...mesh,indices:[0,1,16385]}));
  assert.throws(()=>validateMeshData({...mesh,restPositions:[[0,0,0]]}));
});

test('unbounded preflight retains nonfinite, cycle, accessor, sparse and decorated-array checks',()=>{
  const cyclic:any={};cyclic.self=cyclic;
  for(const value of [cyclic,NaN,Infinity,[1,,2],Object.assign([1],{extra:1}),new Uint8Array(1),new Date(),()=>1])assert.throws(()=>bounded(value));
  let called=false;const getter=Object.defineProperty({},'x',{enumerable:true,get(){called=true;return 1;}});
  assert.throws(()=>bounded(getter));assert.equal(called,false);
  const shared={x:1};bounded({a:shared,b:shared});
});

test('whole glTF imports 116004 indices without users raising nested or public budgets',async()=>{
  const count=116004,raw=new Uint8Array(36+count*2),view=new DataView(raw.buffer);
  [0,0,0,1,0,0,0,1,0].forEach((x,i)=>view.setFloat32(i*4,x,true));
  for(let i=0;i<count;i++)view.setUint16(36+i*2,i%3,true);
  const data={asset:{version:'2.0'},materials:[{pbrMetallicRoughness:{metallicFactor:0,roughnessFactor:0},extensions:{KHR_materials_transmission:{transmissionFactor:.8},KHR_materials_ior:{ior:1.45}}}],scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],meshes:[{primitives:[{attributes:{POSITION:0},indices:1,material:0}]}],buffers:[{uri:'mesh.bin',byteLength:raw.length}],bufferViews:[{buffer:0,byteOffset:0,byteLength:36},{buffer:0,byteOffset:36,byteLength:count*2}],accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[0,0,0],max:[1,1,0]},{bufferView:1,componentType:5123,count,type:'SCALAR'}]};
  const asset=await importGltfCharacter({data,buffers:{'mesh.bin':raw}},{maxBytes:1,maxVertices:1,maxValues:1,maxNodes:1});
  assert.equal(asset.primitives[0].mesh.indices.length,count);
  assert.equal(asset.primitives[0].material.transmission,.8);assert.equal(asset.primitives[0].material.ior,1.45);
  assert.ok(!asset.primitives[0].material.unsupportedMaps?.includes('extension:KHR_materials_transmission'));
  const scope=new NativeRecordingScope();const actor=await attachNativeCharacter({gpu:scope.api} as any,{geometries:{},materials:{},nodes:[],sample:()=>({camera:{projection:'orthographic',position:[0,0,3],target:[0,0,0],near:.01,far:10,viewHeight:3}})},asset,{id:'model'});
  try{assert.equal(actor.scene.materials['model/primitive0'].kind,'pbr');assert.equal((actor.scene.materials['model/primitive0'] as any).transmission,.8);assert.equal((actor.scene.materials['model/primitive0'] as any).ior,1.45);}finally{await actor.dispose();await scope.api.dispose();}
  assert.equal(characterDocument(asset,{maxBytes:1,maxWork:1}).primitives[0].mesh.indices.length,count);
  await assert.rejects(importGltfCharacter({data,buffers:{}}),{code:'E_CHARACTER_RESOURCE'});
});

test('resource verification remains exact without resource byte quotas',async()=>{
  const bytes=Uint8Array.of(1,2,3,4),ref={resourceId:'asset',kind:'file' as const,bytes:4,sha256:await sha256(bytes)};
  await verifyResource(ref,bytes);
  await assert.rejects(verifyResource(ref,Uint8Array.of(1,2,3,5)),{code:'E_GRAPHICS_INTEGRITY'});
  await assert.rejects(verifyResource(ref,bytes.slice(1)),{code:'E_GRAPHICS_INTEGRITY'});
});
