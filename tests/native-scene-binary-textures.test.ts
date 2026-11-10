import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import test from 'node:test';
import sharp from 'sharp';
import {importGltfCharacter} from '../modules/spatial-creation/character-import.ts';
import {prepareNativeCharacterAsset} from '../modules/native-gpu/prepare-character.ts';
import {buildProject} from '../src/compiler/build.ts';
import {surfaceFromPixels,pixelsFromSurface,linear709} from '../src/media/surface.ts';
import {Renderer} from '../src/render/renderer.ts';

test('preparation preserves 16-bit data codes and separates data maps from color decoding',async()=>{
 const root=resolve('.frameweave/scene3d');await mkdir(root,{recursive:true});
 const directory=await mkdtemp(join(root,'prepared-'));
 const asset=await importGltfCharacter({data:new Uint8Array(await readFile('modules/spatial-creation/examples/character-asset/greeting.glb'))});
 const png=await sharp({create:{width:1,height:1,channels:4,background:{r:128,g:64,b:255,alpha:1}}})
  .toColourspace('rgb16').png().toBuffer();
 asset.images.push({id:'normal16',mimeType:'image/png',bytes:[...png]});
 const profiled=await sharp({create:{width:1,height:1,channels:4,background:{r:128,g:64,b:32,alpha:1}}})
  .withIccProfile('p3').png().toBuffer();
 asset.images.push({id:'color-profile',mimeType:'image/png',bytes:[...profiled]});
 asset.primitives[1].material.texture={image:'color-profile',texCoord:0,offset:[0,0],scale:[1,1],
  rotation:0,wrapS:'repeat',wrapT:'repeat',filter:'linear'};
 const material=asset.primitives[0].material;
 material.normalTexture={image:'normal16',texCoord:0,offset:[0,0],scale:[1,1],rotation:0,wrapS:'repeat',wrapT:'repeat',filter:'linear'};
 material.occlusionTexture={...material.normalTexture};material.occlusionStrength=.5;
 assert.ok((await prepareNativeCharacterAsset(asset,directory,{maxAtlasBytes:1,maxDimension:1})).bytes>1);
 const prepared=await prepareNativeCharacterAsset(asset,directory);
 const bytes=await readFile(join(directory,'scene-atlas.f32'));
 assert.equal(bytes.length,prepared.bytes);
 const atlas=prepared.textureAtlas!,map=prepared.materialTextures[material.id].normal!,region=atlas.regions[map];
 assert.equal(prepared.materialTextures[material.id].occlusion,map);
 const offset=(region.y*atlas.width+region.x)*16;
 const actual=Array.from({length:4},(_,i)=>bytes.readFloatLE(offset+i*4));
 const expected=[32768/65535,16384/65535,1,1];
 assert.ok(actual.every((value,i)=>Math.abs(value-expected[i])<3e-8),JSON.stringify({actual,expected}));
 assert.ok(Object.values(prepared.sources).some(source=>source.depth==='ushort'&&source.icc==='ignored-for-data'));
 assert.ok(Object.values(prepared.sources).some(source=>source.color&&source.icc==='explicit-srgb'));
 assert.ok(Object.values(prepared.sources).some(source=>source.color&&source.icc==='ignored-for-gltf-color'));
 const colorMap=prepared.materialTextures[asset.primitives[1].material.id].color!,color=atlas.regions[colorMap];
 const code=await sharp(profiled,{ignoreIcc:true}).ensureAlpha().raw().toBuffer();
 const eotf=(v:number)=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4;
 for(let c=0;c<3;c++)assert.ok(Math.abs(bytes.readFloatLE((color.y*atlas.width+color.x)*16+c*4)-eotf(code[c]/255))<3e-7);
 const carried=JSON.parse(await readFile(join(directory,'model.character.json'),'utf8'));
 assert.ok(carried.images.every((image:{bytes:number[]})=>image.bytes.length===0));
 assert.equal(JSON.parse(await readFile(join(directory,'scene-textures.json'),'utf8')).textureAtlas.decode,'rgba32float-le');
 console.log(JSON.stringify({directory,bytes:prepared.bytes,actual,expected}));
});

const executable=process.env.FRAMEWEAVE_NATIVE_GPU;
test('binary and Surface F32 atlases produce byte-identical HDR, negative RGB and Alpha paths',{
 skip:executable?false:'Set FRAMEWEAVE_NATIVE_GPU to a reviewed Vulkan build',
},async()=>{
 const root=resolve('.frameweave/scene3d');await mkdir(root,{recursive:true});
 const directory=await mkdtemp(join(root,'binary-texture-')),entry=join(directory,'project.tsx');
 const pixels=Float32Array.of(2,.125,-.25,.5);
 await writeFile(join(directory,'atlas.f32'),Buffer.from(pixels.buffer));
 await writeFile(join(directory,'atlas.json'),JSON.stringify(surfaceFromPixels(1,1,pixels,{color:linear709,format:'rgba32float',alpha:'straight'})));
 await writeFile(entry,`
import {Composition,Layer,Resource,Stage,ref} from '@frameweave/engine';
import {createNativeScene,createNativePathTracer,defineNativeStage,type NativeScene3D} from '@frameweave/engine/native';
const shape={restPositions:[[-1,-1,0],[1,-1,0],[0,1,0]] as [number,number,number][],
 indices:[0,1,2],texCoords:[[.5,.5],[.5,.5],[.5,.5]] as [number,number][]};
export const shot=defineNativeStage(async init=>{
 const instances:Awaited<ReturnType<typeof createNativeScene>>[]=[];
 for(const raw of [false,true]) {
  const scene:NativeScene3D={geometries:{shape},materials:{front:{kind:'emissive',radiance:[1,1,1],colorMap:'tile'},
   back:{kind:'emissive',radiance:[0,0,4]}},
   nodes:[{id:'front',geometry:'shape',material:'front'},
    {id:'back',geometry:'shape',material:'back',transform:[1,0,0,0,0,1,0,0,0,0,1,-1]}],
   textureAtlas:{resource:raw?'binary':'json',width:1,height:1,decode:raw?'rgba32float-le':'surface-v2',
    regions:{tile:{x:0,y:0,width:1,height:1}}},
   sample(){return {camera:{projection:'orthographic',position:[0,0,2],target:[0,0,0],near:.1,far:8,viewHeight:.01}};}
  };
  instances.push(await createNativeScene(init,scene),await createNativePathTracer(init,scene,{samples:2,maxBounces:0,aovs:true}),
   await createNativePathTracer(init,{...scene,materials:{...scene.materials,front:{...scene.materials.front,alphaMode:'blend',opacity:.5}}},
    {samples:128,maxBounces:0,aovs:true,denoise:true}));
 }
 return {renderAt(c){const index=(c.frame%2)*3+Math.floor(c.frame/2);
  return instances[index].renderAt({...c,frame:0,globalFrame:0,time:0,globalTime:0,progress:0}, {}, {});},
  dispose:async()=>{for(const instance of instances)await instance.dispose?.();}};
});
export default <Composition width={32} height={16} fps={24} durationInFrames={6}>
 <Resource id="binary" src="./atlas.f32" kind="file"/><Resource id="json" src="./atlas.json" kind="file"/>
 <Stage id="shot" factory={shot}/><Layer source={ref('shot')}/>
</Composition>;`);
 const build=await buildProject(entry);
 const renderer=await Renderer.create(build,{nativeGpu:{
  executable:resolve(executable!),dynamic:'throughput',slots:1,readback:'final-surface',rayQuery:true,
 }});
 try{
  const images=new Map<number,Float32Array>();
  for(const frame of [3,0,1,2,5,4])images.set(frame,pixelsFromSurface(await renderer.renderNativeSurface(frame)));
  for(let mode=0;mode<3;mode++)assert.deepEqual(images.get(mode*2),images.get(mode*2+1));
  assert.deepEqual([...images.get(0)!.slice(0,4)],[2,.125,-.25,1]);
  assert.deepEqual([...images.get(2)!.slice(0,4)],[2,.125,-.25,1]);
  const stats=await renderer.nativeStats();
  assert.ok(stats.resourceImports.binaryUploadBytes>=16);
  console.log(JSON.stringify({project:entry,matchedModes:['preview','path','coverage-and-guides'],resourceImports:stats.resourceImports}));
 }finally{await renderer.close();}
});
