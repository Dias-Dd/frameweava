import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import test from 'node:test';
import {buildProject} from '../src/compiler/build.ts';
import {Renderer} from '../src/render/renderer.ts';
import {pixelsFromSurface,surfaceFromPixels,linear709} from '../src/media/surface.ts';

const executable=process.env.FRAMEWEAVE_NATIVE_GPU;
test('occlusion changes ambient paths and matching environment MIS without dimming direct sun',{
 skip:executable?false:'Set FRAMEWEAVE_NATIVE_GPU to a reviewed Vulkan build',
},async()=>{
 const root=resolve('.frameweave/scene3d');await mkdir(root,{recursive:true});
 const dir=await mkdtemp(join(root,'occlusion-'));
 await writeFile(join(dir,'atlas.json'),JSON.stringify(surfaceFromPixels(2,1,[.25,1,0,.1,1,1,1,1],{
  color:linear709,format:'rgba32float',alpha:'straight',
 })));
 const entry=join(dir,'project.tsx');
 await writeFile(entry,`
import {Composition,Layer,Resource,Stage,ref} from '@frameweave/engine';
import {createNativeScene,createNativePathTracer,defineNativeStage,type NativeScene3D} from '@frameweave/engine/native';
function scene(ao:boolean,lighting:'both'|'sun'|'environment'):NativeScene3D {
 return {geometries:{plane:{restPositions:[[-10,-10,0],[10,-10,0],[10,10,0],[-10,10,0]],
  indices:[0,1,2,0,2,3],texCoords:[[.5,.5],[.5,.5],[.5,.5],[.5,.5]]}},
  materials:{m:{kind:'diffuse',color:[.4,.5,.6],occlusionMap:ao?'ao':undefined,occlusionStrength:.75}},
  nodes:[{id:'plane',geometry:'plane',material:'m'}],
  sun:{direction:[0,0,1],radiance:lighting==='environment'?[0,0,0]:[Math.PI*.2,Math.PI*.2,Math.PI*.2]},
  environment:lighting==='sun'?{lower:[0,0,0],upper:[0,0,0]}:
   {lower:[1,1,1],upper:[1,1,1],map:'environment',importance:{width:1,height:1,luminance:[1]}},
  textureAtlas:{resource:'atlas',width:2,height:1,decode:'surface-v2',regions:{ao:{x:0,y:0,width:1,height:1},
   environment:{x:1,y:0,width:1,height:1}}},
  sample(){return {camera:{projection:'orthographic',position:[0,0,3],target:[0,0,0],near:.01,far:30,viewHeight:2}};}};
}
export const shot=defineNativeStage(async init=>{
 const views=await Promise.all([false,true].map(ao=>createNativeScene(init,scene(ao,'both'))));
 const sun=await Promise.all([false,true].map(ao=>createNativePathTracer(init,scene(ao,'sun'),{samples:2,maxBounces:0})));
 const environment=await Promise.all([false,true].map(ao=>createNativePathTracer(init,scene(ao,'environment'),{samples:2,maxBounces:1})));
 const mis=await Promise.all([false,true].map(ao=>createNativePathTracer(init,scene(ao,'environment'),{samples:32,maxBounces:1,lightSampling:'mis'})));
 const all=[...views,...sun,...environment,...mis];
 return {renderAt(c){return all[c.frame].renderAt(c,{},{});},async dispose(){for(const v of all)await v.dispose?.();}};
});
export default <Composition width={16} height={16} fps={24} durationInFrames={8}>
 <Resource id="atlas" src="./atlas.json" kind="file"/><Stage id="shot" factory={shot}/><Layer source={ref('shot')}/>
</Composition>;`);
 const renderer=await Renderer.create(await buildProject(entry),{nativeGpu:{executable:resolve(executable!),
  dynamic:'throughput',slots:1,readback:'final-surface',rayQuery:true}});
 try {
  const images=new Map<number,Float32Array>(),samples:unknown[]=[];
  for(const frame of [7,0,2,1,4,3,6,5,7]) {
   const pixels=pixelsFromSurface(await renderer.renderNativeSurface(frame));
   if(images.has(frame))assert.deepEqual(pixels,images.get(frame));else images.set(frame,pixels);
   const ao=frame%2?.4375:1;
   const illumination=frame<2?.2+.45*ao:frame<4?.2:ao;
   const expected=[.4,.5,.6].map(c=>c*illumination),mean=[0,0,0];
   for(let i=0;i<256;i++)for(let c=0;c<3;c++)mean[c]+=pixels[i*4+c]/256;
   const error=Math.max(...mean.map((v,c)=>Math.abs(v-expected[c])));
   assert.ok(error<(frame<6?3e-6:.02),JSON.stringify({frame,mean,expected,error}));
   samples.push({frame,mean,expected,error});
  }
  console.log(JSON.stringify({occlusion:.4375,samples}));
 }finally{await renderer.close();}
});
