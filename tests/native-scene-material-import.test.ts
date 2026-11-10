import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import test from 'node:test';
import sharp from 'sharp';
import {importGltfCharacter} from '../modules/spatial-creation/character-import.ts';
import {buildProject} from '../src/compiler/build.ts';
import {pixelsFromSurface,surfaceFromPixels,linear709} from '../src/media/surface.ts';
import {Renderer} from '../src/render/renderer.ts';

const executable=process.env.FRAMEWEAVE_NATIVE_GPU;
test('GLB material channels and transformed second UV set drive the shared animated Native scene',{
 skip:executable?false:'Set FRAMEWEAVE_NATIVE_GPU to a reviewed Vulkan build',
},async()=>{
 const root=resolve('.frameweave/scene3d');
 await mkdir(root,{recursive:true});
 const dir=await mkdtemp(join(root,'material-import-'));
 const bytes=await readFile('modules/spatial-creation/examples/character-asset/greeting.glb');
 const jsonLength=bytes.readUInt32LE(12),source=JSON.parse(bytes.subarray(20,20+jsonLength).toString());
 const binary=bytes.subarray(28+jsonLength);
 const colors=[[160,128,255],[0,128,64],[255,128,0]];
 for(const color of colors) {
  const png=await sharp(Buffer.from([...color,255]),{raw:{width:1,height:1,channels:4}}).png().toBuffer();
  source.images.push({mimeType:'image/png',uri:'data:image/png;base64,'+png.toString('base64')});
  source.textures.push({source:source.images.length-1,sampler:0});
 }
 for(const mesh of source.meshes)for(const primitive of mesh.primitives)
  primitive.attributes.TEXCOORD_1=primitive.attributes.TEXCOORD_0;
 for(const material of source.materials) {
  material.normalTexture={index:1,texCoord:1,scale:-.6,extensions:{KHR_texture_transform:{rotation:Math.PI/2,scale:[2,.5],offset:[1,0]}}};
  material.pbrMetallicRoughness.metallicRoughnessTexture={index:2,texCoord:0,extensions:{KHR_texture_transform:{offset:[.25,0]}}};
  material.emissiveTexture={index:3,texCoord:1};
  material.occlusionTexture={index:2,texCoord:1,strength:.25};
  material.emissiveFactor=[.1,.2,.3];
 }
 const jsonText=Buffer.from(JSON.stringify(source)),padded=Buffer.alloc(Math.ceil(jsonText.length/4)*4,32);
 jsonText.copy(padded);
 const glb=Buffer.alloc(12+8+padded.length+8+binary.length);
 glb.writeUInt32LE(0x46546c67);glb.writeUInt32LE(2,4);glb.writeUInt32LE(glb.length,8);
 glb.writeUInt32LE(padded.length,12);glb.writeUInt32LE(0x4e4f534a,16);padded.copy(glb,20);
 glb.writeUInt32LE(binary.length,20+padded.length);glb.writeUInt32LE(0x004e4942,24+padded.length);
 binary.copy(glb,28+padded.length);
 await writeFile(join(dir,'material-character.glb'),glb);
 const asset=await importGltfCharacter({data:new Uint8Array(glb)});
 const material=asset.primitives[0].material;
 assert.equal(material.normalTexture?.texCoord,1);
 assert.equal(material.normalTexture?.rotation,Math.PI/2);
 assert.equal(material.normalScale,-.6);
 assert.equal(material.occlusionTexture?.texCoord,1);assert.equal(material.occlusionStrength,.25);
 assert.equal(material.metallicRoughnessTexture?.offset[0],.25);
 assert.ok(asset.primitives.every(p=>p.material.emissiveTexture?.image==='image3'));
 const atlas=new Float32Array(5*2*4).fill(1);
 const regionSizes:number[][]=[];
 const decode=(v:number)=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4;
 for(const [index,image] of asset.images.entries()) {
  const {data,info}=await sharp(Buffer.from(image.bytes)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  regionSizes.push([info.width,info.height]);
  for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)for(let c=0;c<4;c++) {
   const value=data[(y*info.width+x)*4+c]/255;
   const linear=c<3&&(index===0||index===3)?decode(value):value;
   atlas[(y*5+(index===0?x:index+1))*4+c]=linear;
  }
  image.bytes=[];
 }
 await writeFile(join(dir,'asset.json'),JSON.stringify(asset));
 await writeFile(join(dir,'atlas.json'),JSON.stringify(surfaceFromPixels(5,2,atlas,{color:linear709,format:'rgba32float',alpha:'straight'})));
 const entry=join(dir,'project.tsx');
 await writeFile(entry,`
import {Composition,Layer,Resource,Stage,keyframes,ref} from '@frameweave/engine';
import {attachNativeCharacter,createNativeScene,createNativePathTracer,defineNativeStage,type NativeScene3D} from '@frameweave/engine/native';
import asset from './asset.json';
const scene:NativeScene3D={geometries:{},materials:{},nodes:[],
 environment:{lower:[.015,.02,.03],upper:[.015,.02,.03]},sun:{direction:[0,0,1],radiance:[3,3,3]},
 textureAtlas:{resource:'atlas',width:5,height:2,decode:'surface-v2',regions:{
  color:{x:0,y:0,width:2,height:2,wrap:'repeat'},
  normal:{x:2,y:0,width:1,height:1,wrap:'repeat'},
  parameters:{x:3,y:0,width:1,height:1,wrap:'repeat'},
  emission:{x:4,y:0,width:1,height:1,wrap:'repeat'}}},
 sample(){return {camera:{projection:'orthographic',position:[2,1,6],target:[0,-.05,0],near:.01,far:30,viewHeight:2.7}};}
};
export const shot=defineNativeStage(async init=>{
 const actor=await attachNativeCharacter(init,scene,asset,{id:'actor',
  textures:{image0:'color',image1:'normal',image2:'parameters',image3:'emission'},
  controls:{clips:[{clip:'greeting',time:keyframes([{frame:0,value:0},{frame:1,value:.5},{frame:2,value:0},{frame:3,value:.5}])}]}});
 const preview=await createNativeScene(init,actor.scene);
 const trace=await createNativePathTracer(init,actor.scene,{samples:4,maxBounces:2});
 return {renderAt(c){return (c.frame<2?preview:trace).renderAt(c,{},{});},
  async dispose(){try{await preview.dispose?.();await trace.dispose?.();}finally{await actor.dispose();}}};
});
export default <Composition width={128} height={72} fps={24} durationInFrames={4}>
 <Resource id="atlas" src="./atlas.json" kind="file"/><Stage id="shot" factory={shot}/><Layer source={ref('shot')}/>
</Composition>;`);
 const build=await buildProject(entry);
 const renderer=await Renderer.create(build,{nativeGpu:{
  executable:resolve(executable!),dynamic:'throughput',slots:1,readback:'final-surface',rayQuery:true,
 }});
 try {
  const images=new Map<number,Float32Array>();
  const difference=(a:Float32Array,b:Float32Array)=>a.reduce((s,v,i)=>s+Math.abs(v-b[i]),0)/a.length;
  for(const frame of [3,0,2,1,3]) {
   const pixels=pixelsFromSurface(await renderer.renderNativeSurface(frame));
   assert.ok(pixels.every(Number.isFinite));
   if(images.has(frame))assert.deepEqual(pixels,images.get(frame));
   images.set(frame,pixels);
  }
  const previewMotion=difference(images.get(0)!,images.get(1)!);
  const pathMotion=difference(images.get(2)!,images.get(3)!);
  const sharedPoseDifference=difference(images.get(0)!,images.get(2)!);
  assert.ok(previewMotion>.004&&pathMotion>.004);
  assert.ok(sharedPoseDifference<.1,JSON.stringify({sharedPoseDifference}));
  console.log(JSON.stringify({project:entry,primitives:asset.primitives.length,materialChannels:5,uvSets:2,
   regionSizes,previewMotion,pathMotion,sharedPoseDifference}));
 }finally{await renderer.close();}
});
