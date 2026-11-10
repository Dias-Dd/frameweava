import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import test from 'node:test';
import {importGltfCharacter} from '../modules/spatial-creation/character-import.ts';
import {sceneTextureLayout} from '../modules/native-gpu/scene-textures.ts';
import type {NativeScene3D} from '../modules/native-gpu/scene.ts';
import {buildProject} from '../src/compiler/build.ts';
import {Renderer} from '../src/render/renderer.ts';
import {pixelsFromSurface} from '../src/media/surface.ts';
import {linear709} from '../src/media/surface.ts';
import {randomBytes} from 'node:crypto';
import {NativeRecordingScope} from '../modules/native-gpu/scope.ts';
import {NativeGpuClient,type NativeProgram} from '../modules/native-gpu/client.ts';
import {NativeBufferExporter} from '../modules/native-gpu/data-export.ts';

const executable=process.env.FRAMEWEAVE_NATIVE_GPU;
const colors=[[1,0,.1,0],[0,1,.2,1],[.2,.1,1,.5]] as const;
const positions:[number,number,number][]=[[-2,-2,0],[2,-2,0],[0,2,0]];

test('reviewed Native owner still executes the original 14-word coverage v1',{
 skip:executable?false:'Set FRAMEWEAVE_NATIVE_GPU to a reviewed Vulkan build',
},async()=>{
 const scope=new NativeRecordingScope(),gpu=scope.api;
 const vertices=await gpu.createField({type:'f32',dimensions:[3,1,1],components:3,semantic:'position',space:'world',units:'meter'},
  Float32Array.from(positions.flat()));
 const scene=await gpu.createRayScene({version:1,invalidGeometry:'discard',geometries:[{positions:vertices,id:0}]});
 const words=new Uint32Array(15),asFloat=new Float32Array(words.buffer);
 asFloat[11]=0;words[12]=1;asFloat[13]=.5;
 const layout=await gpu.createBuffer({type:'u32',length:15},words);
 const texels=await gpu.createBuffer({type:'f32',length:4},Float32Array.of(1,1,1,1));
 const image=await gpu.compile({abiVersion:1,id:'test/legacy-alpha-output',version:'1.0.0',inputCount:0,parameterWords:0,
  code:'fn pixel(p:vec2u)->vec4f{return vec4f(0.,0.,0.,1.);}'});
 scope.sealInitialization();scope.beginFrame();
 const origins=await gpu.createField({type:'f32',dimensions:[1,1,1],components:3,semantic:'position',space:'world',units:'meter'},Float32Array.of(0,0,2));
 const directions=await gpu.createField({type:'f32',dimensions:[1,1,1],components:3,semantic:'generic'},Float32Array.of(0,0,-1));
 const opaque=await gpu.traceRayScene(scene,{version:1,origins,directions});
 const masked=await gpu.traceRayScene(scene,{version:1,origins,directions,coverage:{version:1,layout,texels}});
 await gpu.publishBuffer('opaque',opaque.hits,{version:1});await gpu.publishBuffer('masked',masked.hits,{version:1});
 scope.publish(await gpu.run(image,[],{output:{width:1,height:1,format:'rgba32float',alpha:'opaque',color:linear709}}));
 const {parameters,output:_o,external:_e,kernelOffset:_k,moduleOffset:_m,...p}=scope.packet();
 const program:NativeProgram={...p,version:2,session:randomBytes(32).toString('hex'),rayQuery:true,slots:1,maxBytes:16*1024**2,display:null};
 const exporter=await NativeBufferExporter.create();exporter.configure(program);
 const client=await NativeGpuClient.create(program,{executable:resolve(executable!)});
 try {
  const ticket=await client.submit(0,parameters);await ticket.completed;
  assert.equal((await exporter.read(client,ticket,'opaque')).values[0],1);
  assert.equal((await exporter.read(client,ticket,'masked')).values[0],0);
 }finally{await client.close();await exporter.close();await gpu.dispose();}
});

test('scene vertex attributes reject incomplete or out-of-range RGBA streams',()=>{
 const geometry={restPositions:positions,indices:[0,1,2],colors};
 const scene:NativeScene3D={geometries:{g:geometry},materials:{m:{kind:'unlit',color:[1,1,1]}},
  nodes:[{id:'g',geometry:'g',material:'m'}],sample(){throw Error('not evaluated');}};
 const layout=()=>sceneTextureLayout(scene,scene.nodes,new Map(Object.entries(scene.geometries)));
 assert.equal(layout().words[0],16);
 scene.geometries={g:{...geometry,colors:[[0,0,0,1]]}};
 assert.throws(layout,{code:'E_NATIVE_SCENE_TEXTURE'});
 scene.geometries={g:{...geometry,colors:[[2,0,0,1],colors[1],colors[2]]}};
 assert.throws(layout,{code:'E_NATIVE_SCENE_TEXTURE'});
});

test('GLB vertex color and Alpha agree with independent barycentrics through morph, path guides and preview',{
 skip:executable?false:'Set FRAMEWEAVE_NATIVE_GPU to a reviewed Vulkan build',
},async()=>{
 const root=resolve('.frameweave/scene3d');await mkdir(root,{recursive:true});
 const dir=await mkdtemp(join(root,'vertex-color-'));
 const values=Float32Array.from([...positions.flat(),...colors.flat(),...positions.flatMap(()=>[.2,0,0])]);
 const bin=Buffer.from(values.buffer);
 const json={asset:{version:'2.0'},buffers:[{byteLength:bin.length}],
  bufferViews:[{buffer:0,byteOffset:0,byteLength:36},{buffer:0,byteOffset:36,byteLength:48},
   {buffer:0,byteOffset:84,byteLength:36}],
  accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[-2,-2,0],max:[2,2,0]},
   {bufferView:1,componentType:5126,count:3,type:'VEC4'},
   {bufferView:2,componentType:5126,count:3,type:'VEC3',min:[.2,0,0],max:[.2,0,0]}],
  materials:[{pbrMetallicRoughness:{baseColorFactor:[.8,.6,.4,.9]},alphaMode:'MASK',alphaCutoff:.45,
   doubleSided:true,extensions:{KHR_materials_unlit:{}}}],
  meshes:[{primitives:[{attributes:{POSITION:0,COLOR_0:1},material:0,targets:[{POSITION:2}]}],extras:{targetNames:['slide']}}],
  nodes:[{mesh:0}],scenes:[{nodes:[0]}],scene:0};
 const text=Buffer.from(JSON.stringify(json)),padded=Buffer.alloc(Math.ceil(text.length/4)*4,32);text.copy(padded);
 const glb=Buffer.alloc(28+padded.length+bin.length);
 glb.writeUInt32LE(0x46546c67);glb.writeUInt32LE(2,4);glb.writeUInt32LE(glb.length,8);
 glb.writeUInt32LE(padded.length,12);glb.writeUInt32LE(0x4e4f534a,16);padded.copy(glb,20);
 glb.writeUInt32LE(bin.length,20+padded.length);glb.writeUInt32LE(0x004e4942,24+padded.length);bin.copy(glb,28+padded.length);
 const asset=await importGltfCharacter({data:new Uint8Array(glb)});
 assert.deepEqual(asset.primitives[0].colors,colors.map(c=>c.map(Math.fround)));
 await writeFile(join(dir,'colored.glb'),glb);
 await writeFile(join(dir,'asset.json'),JSON.stringify(asset));
 const entry=join(dir,'project.tsx');
 await writeFile(entry,`
import {Composition,Layer,Stage,keyframes,ref} from '@frameweave/engine';
import {attachNativeCharacter,createNativeScene,createNativePathTracer,defineNativeStage,type NativeScene3D} from '@frameweave/engine/native';
import asset from './asset.json';
export const shot=defineNativeStage(async init=>{
 const scene:NativeScene3D={geometries:{back:{restPositions:[[-4,-4,-1],[4,-4,-1],[0,4,-1]],indices:[0,1,2]}},
  materials:{back:{kind:'unlit',color:[.07,.11,.19]}},nodes:[{id:'back',geometry:'back',material:'back'}],
  sample(){return {camera:{projection:'orthographic',position:[0,0,3],target:[0,0,0],near:.01,far:10,viewHeight:2}};}};
 const actor=await attachNativeCharacter(init,scene,asset,{id:'actor',controls:{morphs:[{target:'slide',
  weight:keyframes([{frame:0,value:0},{frame:1,value:1},{frame:2,value:0},{frame:3,value:1}])}]}});
 const preview=await createNativeScene(init,actor.scene);
 const path=await createNativePathTracer(init,actor.scene,{samples:2,maxBounces:0,aovs:true});
 return {renderAt(c){return (c.frame<2?preview:path).renderAt(c,{},{});},
  async dispose(){try{await preview.dispose?.();await path.dispose?.();}finally{await actor.dispose();}}};
});
export default <Composition width={32} height={32} fps={24} durationInFrames={4}>
 <Stage id="shot" factory={shot}/><Layer source={ref('shot')}/>
</Composition>;`);
 const build=await buildProject(entry),renderer=await Renderer.create(build,{nativeGpu:{
  executable:resolve(executable!),dynamic:'throughput',slots:1,readback:'final-surface',rayQuery:true,
 }});
 try {
  let maximumError=0,foreground=0,background=0;
  const repeated=new Map<number,Float32Array>();
  for(const frame of [3,0,2,1,3]) {
   const ticket=await renderer.submitNativeFrame(frame);await ticket.completed;
   const pixels=frame<2?pixelsFromSurface(await renderer.renderNativeSurface(frame)):
    (await renderer.exportNativeBuffer(ticket,'shot/path-guide')).values as Float32Array;
   if(repeated.has(frame))assert.deepEqual(pixels,repeated.get(frame));else repeated.set(frame,pixels);
   for(let y=0;y<32;y++)for(let x=0;x<32;x++) {
    const px=(x+.5)/16-1-(frame%2?.2:0),py=1-(y+.5)/16;
    const w2=(py+2)/4,w1=(px+2-2*w2)/4,w0=1-w1-w2;
    const color=[0,1,2,3].map(c=>w0*colors[0][c]+w1*colors[1][c]+w2*colors[2][c]);
    const hit=w0>=0&&w1>=0&&w2>=0&&color[3]*.9>=.45;
    const expected=hit?color.slice(0,3).map((v,c)=>v*[.8,.6,.4][c]):[.07,.11,.19];
    if(hit)foreground++;else background++;
    const index=(y*32+x)*(frame<2?4:8)+(frame<2?0:4);
    for(let c=0;c<3;c++)maximumError=Math.max(maximumError,Math.abs(pixels[index+c]-expected[c]));
   }
  }
  assert.ok(maximumError<3e-6,JSON.stringify({maximumError}));
  assert.ok(foreground>100&&background>100);
  console.log(JSON.stringify({maximumError,foreground,background,frames:[3,0,2,1,3]}));
 }finally{await renderer.close();}
});
