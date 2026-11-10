import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import test from 'node:test';
import sharp from 'sharp';
import {importGltfCharacter} from '../modules/spatial-creation/character-import.ts';
import {buildProject} from '../src/compiler/build.ts';
import {Renderer} from '../src/render/renderer.ts';
import {pixelsFromSurface,surfaceFromPixels,linear709} from '../src/media/surface.ts';

const executable=process.env.FRAMEWEAVE_NATIVE_GPU;
test('authored glTF tangent frames and tangent morphs survive nonuniform GPU skin transforms in both renderers',{
 skip:executable?false:'Set FRAMEWEAVE_NATIVE_GPU to a reviewed Vulkan build',
},async()=>{
 const root=resolve('.frameweave/scene3d');await mkdir(root,{recursive:true});
 const dir=await mkdtemp(join(root,'tangent-'));
 const arrays=[[-2,-2,0,2,-2,0,0,2,0],[0,0,1,0,0,1,0,0,1],[0,1,0,1,0,1,0,1,0,1,0,1],
  [0,1,1,1,.5,0],[1,0,0,1,0,0,1,0,0],[0,0,0,0,0,0,0,0,0]];
 const binary=Buffer.from(Float32Array.from(arrays.flat()).buffer);
 let offset=0;
 const bufferViews=arrays.map(array=>{const view={buffer:0,byteOffset:offset,byteLength:array.length*4};offset+=view.byteLength;return view;});
 const png=await sharp(Buffer.from([204,179,255,255]),{raw:{width:1,height:1,channels:4}}).png().toBuffer();
 const json={asset:{version:'2.0'},buffers:[{byteLength:binary.length,uri:'mesh.bin'}],bufferViews,
  accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[-2,-2,0],max:[2,2,0]},
   {bufferView:1,componentType:5126,count:3,type:'VEC3'},
   {bufferView:2,componentType:5126,count:3,type:'VEC4'},
   {bufferView:3,componentType:5126,count:3,type:'VEC2'},
   {bufferView:4,componentType:5126,count:3,type:'VEC3'},
   {bufferView:5,componentType:5126,count:3,type:'VEC3',min:[0,0,0],max:[0,0,0]}],
  images:[{uri:'data:image/png;base64,'+png.toString('base64')}],textures:[{source:0}],
  materials:[{pbrMetallicRoughness:{baseColorFactor:[1,1,1,1],metallicFactor:0,roughnessFactor:1},normalTexture:{index:0},doubleSided:true}],
  meshes:[{primitives:[{attributes:{POSITION:0,NORMAL:1,TANGENT:2,TEXCOORD_0:3},material:0,targets:[{TANGENT:4,POSITION:5}]}],extras:{targetNames:['turn']}}],
  nodes:[{mesh:0,scale:[2,3,1]}],scenes:[{nodes:[0]}],scene:0};
 const dynamic=await importGltfCharacter({data:json,buffers:{'mesh.bin':binary}});
 assert.deepEqual(dynamic.primitives[0].tangents,[[0,1,0,1],[0,1,0,1],[0,1,0,1]]);
 assert.deepEqual(dynamic.primitives[0].morphs[0].tangents,[[1,0,0],[1,0,0],[1,0,0]]);
 const rigid=structuredClone(dynamic);rigid.primitives[0].morphs=[];rigid.primitives[0].weights=[];
 // Exercise a true two-influence CSR skin. The weighted matrix is diag(2,3,1),
 // independently matching the rigid node's transform without sharing its path.
 dynamic.nodes.push({id:'joint-a',name:'joint-a',parent:null,matrix:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]},
  {id:'joint-b',name:'joint-b',parent:null,matrix:[7/3,0,0,0,0,11/3,0,0,0,0,1,0,0,0,0,1]});
 dynamic.primitives[0].skin={joints:['joint-a','joint-b'],
  inverseBind:[[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]],
  influences:Array.from({length:3},()=>[{joint:0,weight:.25},{joint:1,weight:.75}])};
 await writeFile(join(dir,'dynamic.json'),JSON.stringify(dynamic));
 await writeFile(join(dir,'rigid.json'),JSON.stringify(rigid));
 await writeFile(join(dir,'atlas.json'),JSON.stringify(surfaceFromPixels(1,1,[.8,179/255,1,1],{
  color:linear709,format:'rgba32float',alpha:'straight',
 })));
 const entry=join(dir,'project.tsx');
 await writeFile(entry,`
import {Composition,Layer,Resource,Stage,ref} from '@frameweave/engine';
import {attachNativeCharacter,createNativeScene,createNativePathTracer,defineNativeStage,type NativeScene3D} from '@frameweave/engine/native';
import rigid from './rigid.json';import dynamic from './dynamic.json';
export const shot=defineNativeStage(async init=>{
 const base:NativeScene3D={geometries:{},materials:{},nodes:[],
  textureAtlas:{resource:'normal',width:1,height:1,decode:'surface-v2',regions:{normal:{x:0,y:0,width:1,height:1,wrap:'repeat'}}},
  sun:{direction:[0,1,1],radiance:[Math.PI,Math.PI,Math.PI]},environment:{lower:[0,0,0],upper:[0,0,0]},
  sample(){return {camera:{projection:'orthographic',position:[0,0,3],target:[0,0,0],near:.01,far:10,viewHeight:2}};}};
 const actors=await Promise.all([rigid,dynamic].map((asset,i)=>attachNativeCharacter(init,base,asset,{id:'actor'+i,
  textures:{image0:'normal'},controls:i?{morphs:[{target:'turn',weight:1}]}:{}})));
 const scenes=actors.map(a=>({...a.scene,materials:Object.fromEntries(Object.keys(a.scene.materials).map(id=>
  [id,{kind:'diffuse',color:[1,1,1],normalMap:'normal',coordinates:{normal:{set:'0'}}}]))} as NativeScene3D));
 const views=await Promise.all(scenes.map(s=>createNativeScene(init,s)));
 const traces=await Promise.all(scenes.map(s=>createNativePathTracer(init,s,{samples:2,maxBounces:0,aovs:true})));
 return {renderAt(c){return (c.frame<2?views:traces)[c.frame%2].renderAt(c,{},{});},
  async dispose(){try{for(const v of [...views,...traces])await v.dispose?.();}finally{for(const a of actors)await a.dispose();}}};
});
export default <Composition width={16} height={16} fps={24} durationInFrames={4}>
 <Resource id="normal" src="./atlas.json" kind="file"/><Stage id="shot" factory={shot}/><Layer source={ref('shot')}/>
</Composition>;`);
 const renderer=await Renderer.create(await buildProject(entry),{nativeGpu:{executable:resolve(executable!),
  dynamic:'throughput',slots:1,readback:'final-surface',rayQuery:true}});
 const normalize=(v:number[])=>{const m=Math.hypot(...v);return v.map(x=>x/m);};
 const normals=[0,1].map(morph=>{
  const t=normalize([morph*2,3,0]),b=[-t[1],t[0],0],ny=179/255*2-1;
  return normalize(t.map((v,c)=>v*.6+b[c]*ny+(c===2?1:0)));
 });
 try {
  let maximumNormalError=0,maximumPreviewError=0;
  const images=new Map<number,Float32Array>();
  for(const frame of [3,0,2,1,3]) {
   const ticket=await renderer.submitNativeFrame(frame);await ticket.completed;
   const values=frame<2?pixelsFromSurface(await renderer.renderNativeSurface(frame)):
    (await renderer.exportNativeBuffer(ticket,'shot/path-guide')).values as Float32Array;
   if(images.has(frame))assert.deepEqual(values,images.get(frame));else images.set(frame,values);
   const expected=normals[frame%2];
   for(let i=0;i<256;i++)for(let c=0;c<3;c++) {
    if(frame<2)maximumPreviewError=Math.max(maximumPreviewError,Math.abs(values[i*4+c]-(expected[1]+expected[2])/Math.SQRT2));
    else maximumNormalError=Math.max(maximumNormalError,Math.abs(values[i*8+c]-expected[c]));
   }
  }
  assert.ok(maximumNormalError<2e-6,JSON.stringify({maximumNormalError}));
  assert.ok(maximumPreviewError<2e-6,JSON.stringify({maximumPreviewError}));
  console.log(JSON.stringify({maximumNormalError,maximumPreviewError,normals}));
 }finally{await renderer.close();}
});
