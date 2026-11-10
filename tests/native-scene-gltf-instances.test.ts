import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import test from 'node:test';
import {importGltfCharacter} from '../modules/spatial-creation/character-import.ts';
import {characterDocument} from '../modules/spatial-creation/character-animation.ts';
import {buildProject} from '../src/compiler/build.ts';
import {pixelsFromSurface} from '../src/media/surface.ts';
import {Renderer} from '../src/render/renderer.ts';

const executable=process.env.FRAMEWEAVE_NATIVE_GPU;
test('a real EXT_mesh_gpu_instancing GLB preserves every instance and reuses one animated Native BLAS',{
 skip:executable?false:'Set FRAMEWEAVE_NATIVE_GPU to a reviewed Vulkan build',
},async()=>{
 const root=resolve('.frameweave/scene3d');
 await mkdir(root,{recursive:true});
 const dir=await mkdtemp(join(root,'imported-instances-')),entry=join(dir,'project.tsx');
 const bytes=await readFile('modules/spatial-creation/examples/character-asset/greeting.glb');
 const jsonLength=bytes.readUInt32LE(12),source=JSON.parse(bytes.subarray(20,20+jsonLength).toString());
 const chunks=[bytes.subarray(28+jsonLength)];
 let binaryLength=chunks[0].length;
 function accessor(values:number[],width:number) {
  const data=Buffer.from(Float32Array.from(values).buffer);
  const view=source.bufferViews.length;
  source.bufferViews.push({buffer:0,byteOffset:binaryLength,byteLength:data.length});
  chunks.push(data);binaryLength+=data.length;
  const result=source.accessors.length;
  source.accessors.push({bufferView:view,componentType:5126,count:values.length/width,type:width===1?'SCALAR':'VEC3'});
  return result;
 }
 const count=1024,translations=Array.from({length:count},(_,i)=>[(i%32-15.5)*.5,(Math.floor(i/32)-15.5)*.5,0]).flat();
 const instanceAccessor=accessor(translations,3),times=accessor([0,1],1),positions=accessor([0,0,0,.25,0,0],3),morphValues=accessor([0,1],1);
 const primitive=source.meshes[0].primitives[0],originalTargets=structuredClone(primitive.targets);
 delete primitive.targets;
 primitive.material=0;
 source.meshes=[{primitives:[primitive]}];
 source.nodes=[{mesh:0,extensions:{EXT_mesh_gpu_instancing:{attributes:{TRANSLATION:instanceAccessor}}}}];
 source.scenes=[{nodes:[0]}];source.scene=0;source.skins=[];
 source.animations=[{name:'instancePan',channels:[{sampler:0,target:{node:0,path:'translation'}}],
  samplers:[{input:times,output:positions,interpolation:'LINEAR'}]}];
 source.materials=[{pbrMetallicRoughness:{baseColorFactor:[.2,.4,.6,1]},doubleSided:true,extensions:{KHR_materials_unlit:{}}}];
 source.extensionsUsed=['EXT_mesh_gpu_instancing','KHR_materials_unlit'];
 source.extensionsRequired=['EXT_mesh_gpu_instancing'];
 source.buffers=[{byteLength:binaryLength}];
 const binary=Buffer.concat(chunks);
 const pack=()=>{
  const jsonText=Buffer.from(JSON.stringify(source)),padded=Buffer.alloc(Math.ceil(jsonText.length/4)*4,32);
  jsonText.copy(padded);
  const glb=Buffer.alloc(28+padded.length+binary.length);
  glb.writeUInt32LE(0x46546c67);glb.writeUInt32LE(2,4);glb.writeUInt32LE(glb.length,8);
  glb.writeUInt32LE(padded.length,12);glb.writeUInt32LE(0x4e4f534a,16);padded.copy(glb,20);
  glb.writeUInt32LE(binary.length,20+padded.length);glb.writeUInt32LE(0x004e4942,24+padded.length);
  binary.copy(glb,28+padded.length);
  return glb;
 };
 const glb=pack();
 await writeFile(join(dir,'instances.glb'),glb);
 const asset=characterDocument(await importGltfCharacter({data:new Uint8Array(glb)}));
 assert.equal(asset.primitives.length,1);
 assert.equal(asset.primitives[0].instances?.length,count);
 assert.equal(asset.clips[0].id,'instancePan');
 assert.equal((await importGltfCharacter({data:new Uint8Array(glb)},{maxNodes:1})).primitives[0].instances?.length,count);
 await writeFile(join(dir,'asset.json'),JSON.stringify(asset));
 source.meshes[0].primitives[0].targets=originalTargets;
 source.meshes[0].weights=[.25];
 source.meshes[0].extras={targetNames:['breathe']};
 source.nodes[0].rotation=[0,0,Math.sin(Math.PI/12),Math.cos(Math.PI/12)];
 source.nodes[0].scale=[1.2,.8,1];
 source.animations[0].channels.push({sampler:1,target:{node:0,path:'weights'}});
 source.animations[0].samplers.push({input:times,output:morphValues,interpolation:'LINEAR'});
 const morphed=characterDocument(await importGltfCharacter({data:new Uint8Array(pack())}));
 assert.equal(morphed.primitives[0].weights[0],.25);
 assert.equal(morphed.clips[0].tracks.filter(t=>t.property==='morphTargetInfluences').length,1);
 assert.equal(morphed.primitives[0].morphs[0].id,'breathe');
 await writeFile(join(dir,'morph-asset.json'),JSON.stringify(morphed));
 await writeFile(entry,`
import {Composition,Layer,Stage,ref} from '@frameweave/engine';
import {attachNativeCharacter,createNativePathTracer,defineNativeStage,type NativeScene3D} from '@frameweave/engine/native';
import asset from './asset.json';
export const shot=defineNativeStage(async init=>{
 const scene:NativeScene3D={geometries:{},materials:{},nodes:[],
  environment:{lower:[.01,.01,.01],upper:[.01,.01,.01]},
  sample(){return {camera:{projection:'orthographic',position:[0,0,10],target:[0,0,0],near:.1,far:30,viewHeight:17}};}
 };
 const actor=await attachNativeCharacter(init,scene,asset,{id:'instances',controls:{clips:[{clip:'instancePan'}]}});
 const path=await createNativePathTracer(init,actor.scene,{aovs:true,samples:1,maxBounces:0});
 return {renderAt(c){return path.renderAt(c,{},{});},
  async dispose(){try{await path.dispose?.();}finally{await actor.dispose();}}};
});
export default <Composition width={256} height={256} fps={24} durationInFrames={24}>
 <Stage id="shot" factory={shot}/><Layer source={ref('shot')}/>
</Composition>;`);
 const renderer=await Renderer.create(await buildProject(entry),{nativeGpu:{
  executable:resolve(executable!),dynamic:'throughput',slots:1,readback:'final-surface',rayQuery:true,
 }});
 try {
  const result=new Map<number,Float32Array>();
  for(const frame of [12,0,23,12]) {
   const ticket=await renderer.submitNativeFrame(frame);
   await ticket.completed;
   const guide=(await renderer.exportNativeBuffer(ticket,'shot/path-guide')).values as Float32Array;
   const ids=new Set<number>();
   for(let i=7;i<guide.length;i+=8)if(guide[i])ids.add(Math.abs(guide[i])-1);
   assert.equal(ids.size,count);
   if(result.has(frame))assert.deepEqual(guide,result.get(frame));
   result.set(frame,guide);
  }
  assert.notDeepEqual(result.get(0),result.get(23));
  const stats=await renderer.nativeStats();
  const hardware=stats.hardwareRayQuery;
  assert.equal(hardware.residentBlas,1);
  assert.equal(hardware.residentInstances,count);
  assert.equal(hardware.geometryBuilds,1);
  assert.equal(hardware.cpuGeometryReadbacks,0);
  console.log(JSON.stringify({project:entry,sourceBytes:glb.length,instances:count,hardware}));
 }finally{await renderer.close();}
 const morphEntry=join(dir,'morph-project.tsx');
 await writeFile(morphEntry,(await readFile(entry,'utf8')).replace("./asset.json","./morph-asset.json").replace("viewHeight:17","viewHeight:26"));
 const morphRenderer=await Renderer.create(await buildProject(morphEntry),{nativeGpu:{
  executable:resolve(executable!),dynamic:'throughput',slots:1,readback:'final-surface',rayQuery:true,
 }});
 try {
  const guides=new Map<number,Float32Array>();
  for(const frame of [23,0,12,23]) {
   const ticket=await morphRenderer.submitNativeFrame(frame);await ticket.completed;
   const guide=(await morphRenderer.exportNativeBuffer(ticket,'shot/path-guide')).values as Float32Array;
   if(guides.has(frame))assert.deepEqual(guide,guides.get(frame));
   guides.set(frame,guide);
   assert.ok(guide.every(Number.isFinite));
   const ids=new Set<number>();
   for(let i=7;i<guide.length;i+=8)if(guide[i])ids.add(Math.abs(guide[i])-1);
   assert.equal(ids.size,count);
  }
  assert.notDeepEqual(guides.get(0),guides.get(23));
  const hardware=(await morphRenderer.nativeStats()).hardwareRayQuery;
  assert.equal(hardware.residentBlas,1);
  assert.equal(hardware.residentInstances,count);
  console.log(JSON.stringify({morphProject:morphEntry,morphInstances:count,transforms:'rotated and nonuniform parent',hardware}));
 }finally{await morphRenderer.close();}
});
