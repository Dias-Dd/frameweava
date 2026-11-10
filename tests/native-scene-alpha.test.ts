import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import test from 'node:test';
import {buildProject} from '../src/compiler/build.ts';
import {pixelsFromSurface,surfaceFromPixels,linear709} from '../src/media/surface.ts';
import {Renderer} from '../src/render/renderer.ts';
import {NativeRecordingScope} from '../modules/native-gpu/scope.ts';

test('coverage recording validates versions, complete layouts, aliases and Stage ownership',async()=>{
 const scope=new NativeRecordingScope(),gpu=scope.api;
 const positions=await gpu.createField({type:'f32',dimensions:[3,1,1],components:3,semantic:'position',space:'world',units:'meter'},
  Float32Array.of(-1,-1,0,1,-1,0,0,1,0));
 const scene=await gpu.createRayScene({version:1,invalidGeometry:'discard',geometries:[{positions,id:0}]});
 scope.sealInitialization();scope.beginFrame();
 const origins=await gpu.createField({type:'f32',dimensions:[1,1,1],components:3,semantic:'position',space:'world',units:'meter'},Float32Array.of(0,0,2));
 const directions=await gpu.createField({type:'f32',dimensions:[1,1,1],components:3,semantic:'generic'},Float32Array.of(0,0,-1));
 const layout=await gpu.createBuffer({type:'u32',length:15},new Uint32Array(15));
 const texels=await gpu.createBuffer({type:'f32',length:4},Float32Array.of(1,1,1,1));
 const request={version:1 as const,origins,directions};
 const coverage={version:1 as const,layout,texels};
 try{
  await assert.rejects(gpu.traceRayScene(scene,{...request,coverage:{...coverage,version:3 as 1}}),{code:'E_NATIVE_RAY_COVERAGE'});
  await assert.rejects(gpu.traceRayScene(scene,{...request,coverage:{...coverage,version:2}}),{code:'E_NATIVE_RAY_COVERAGE'});
  const short=await gpu.createBuffer({type:'u32',length:2});
  await assert.rejects(gpu.traceRayScene(scene,{...request,coverage:{...coverage,layout:short}}),{code:'E_NATIVE_RAY_COVERAGE'});
  await assert.rejects(gpu.traceRayScene(scene,{...request,coverage:{...coverage,seed:-1}}),{code:'E_NATIVE_RAY_COVERAGE'});
  const other=new NativeRecordingScope();
  const foreign=await other.api.createBuffer({type:'u32',length:15});
  try{await assert.rejects(gpu.traceRayScene(scene,{...request,coverage:{...coverage,layout:foreign}}),{code:'E_NATIVE_SCOPE'});}
  finally{await other.api.dispose();}
  const output=await gpu.traceRayScene(scene,request);
  await assert.rejects(gpu.traceRayScene(scene,{...request,output,coverage:{...coverage,texels:output.normals}}),{code:'E_NATIVE_RAY_OUTPUT'});
  await gpu.traceRayScene(scene,{...request,coverage});
 }finally{await gpu.dispose();}
});

const executable=process.env.FRAMEWEAVE_NATIVE_GPU;
test('hardware candidates apply texture masks, stochastic blend and transformed one-sided coverage',{
 skip:executable?false:'Set FRAMEWEAVE_NATIVE_GPU to a reviewed Vulkan build',
},async()=>{
 const root=resolve('.frameweave/scene3d');
 await mkdir(root,{recursive:true});
 const dir=await mkdtemp(join(root,'alpha-')),entry=join(dir,'project.tsx');
 await writeFile(join(dir,'atlas.json'),JSON.stringify(surfaceFromPixels(2,1,[1,1,1,0,1,1,1,1],{
  color:linear709,format:'rgba32float',alpha:'straight',
 })));
 await writeFile(entry,`
import {Composition,Layer,Resource,Stage,ref} from '@frameweave/engine';
import {createNativePathTracer,defineNativeStage,type NativeScene3D} from '@frameweave/engine/native';
const geometry={restPositions:[[-1,-1,0],[1,-1,0],[1,1,0],[-1,1,0]] as [number,number,number][],
 indices:[0,1,2,0,2,3],texCoords:[[0,1],[1,1],[1,0],[0,0]] as [number,number][]};
const base:NativeScene3D={
 geometries:{geometry},materials:{blue:{kind:'emissive',radiance:[0,0,4]},
  red:{kind:'emissive',radiance:[8,0,0]}},
 nodes:[{id:'background',geometry:'geometry',material:'blue'},
  {id:'foreground',geometry:'geometry',material:'red',transform:[1,0,0,0,0,1,0,0,0,0,1,1]}],
 textureAtlas:{resource:'atlas',width:2,height:1,decode:'surface-v2',regions:{alpha:{x:0,y:0,width:2,height:1,filter:'nearest'}}},
 environment:{lower:[.1,.2,.3],upper:[.1,.2,.3]},
 sample(c) {
  const x=c.frame===0?-.5:c.frame===1?.5:0,z=c.frame===4?-3:3;
  return {camera:{projection:'orthographic',position:[x,0,z],target:[x,0,0],near:.1,far:10,viewHeight:.05},
   transforms:{foreground:[c.frame===5?-1:1,0,0,0,0,1,0,0,0,0,1,1]}};
 }
};
export const shot=defineNativeStage(async init=>{
 const mask=await createNativePathTracer(init,{...base,materials:{...base.materials,
  red:{kind:'emissive',radiance:[8,0,0],colorMap:'alpha',alphaMode:'mask'}}},{samples:2,maxBounces:0});
 const blend=await createNativePathTracer(init,{...base,materials:{...base.materials,
  red:{kind:'emissive',radiance:[8,0,0],alphaMode:'blend',opacity:.25}}},{samples:128,maxBounces:0});
 const single=await createNativePathTracer(init,{...base,nodes:[base.nodes[1]],materials:{
  red:{kind:'emissive',radiance:[8,0,0],doubleSided:false}}},{samples:2,maxBounces:0});
 const instances=[mask,mask,blend,single,single,single];
 return {renderAt(c){return instances[c.frame].renderAt(c,{},{});},
  dispose:async()=>{await mask.dispose?.();await blend.dispose?.();await single.dispose?.();}};
});
export default <Composition width={32} height={16} fps={24} durationInFrames={6}>
 <Resource id="atlas" src="./atlas.json" kind="file"/><Stage id="shot" factory={shot}/><Layer source={ref('shot')}/>
</Composition>;`);
 const build=await buildProject(entry);
 const renderer=await Renderer.create(build,{nativeGpu:{
  executable:resolve(executable!),dynamic:'throughput',slots:1,readback:'final-surface',rayQuery:true,
 }});
 try {
  const images=new Map<number,Float32Array>();
  for(const frame of [5,1,0,4,2,3,2]) {
   const pixels=pixelsFromSurface(await renderer.renderNativeSurface(frame));
   if(images.has(frame))assert.deepEqual(pixels,images.get(frame));
   images.set(frame,pixels);
   const expected=frame===0?[0,0,4]:frame===1||frame===3?[8,0,0]:frame===2?[2,0,3]:[.1,.2,.3];
   let error=0;
   const means=[0,0,0];
   for(let i=0;i<pixels.length;i+=4)for(let c=0;c<3;c++){
    means[c]+=pixels[i+c]/(32*16);
    if(frame!==2)error=Math.max(error,Math.abs(pixels[i+c]-expected[c]));
   }
   if(frame===2)assert.ok(means.every((value,c)=>Math.abs(value-expected[c])<.04),JSON.stringify({means,expected}));
   else assert.ok(error<1e-6,JSON.stringify({frame,means,expected,error}));
   console.log(JSON.stringify({frame,means,error}));
  }
 }finally{await renderer.close();}
});
