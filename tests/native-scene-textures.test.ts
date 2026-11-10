import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import test from 'node:test';
import {buildProject} from '../src/compiler/build.ts';
import {linear709,pixelsFromSurface,surfaceFromPixels} from '../src/media/surface.ts';
import {Renderer} from '../src/render/renderer.ts';

const executable = process.env.FRAMEWEAVE_NATIVE_GPU;

test('ray hit barycentrics drive shared bilinear material maps in preview and path tracing', {
  skip: executable ? false : 'Set FRAMEWEAVE_NATIVE_GPU to a reviewed Vulkan build',
}, async () => {
  const root = resolve('.frameweave/scene3d');
  await mkdir(root, {recursive: true});
  const dir = await mkdtemp(join(root, 'texture-'));
  const atlas = surfaceFromPixels(3, 1, [.1,.3,2,1, .7,1.3,4,1, 100,100,100,1], {
    color: linear709, format: 'rgba32float', alpha: 'straight',
  });
  await writeFile(join(dir, 'atlas.json'), JSON.stringify(atlas));
  const entry = join(dir, 'project.tsx');
  await writeFile(entry, `
import {Composition, Stage, Layer, Resource, ref} from '@frameweave/engine';
import {createNativePathTracer, createNativeScene, defineNativeStage, type NativeScene3D} from '@frameweave/engine/native';
const scene: NativeScene3D = {
  geometries:{card:{
    restPositions:[[-1,-1,0],[1,-1,0],[1,1,0],[-1,1,0]],
    indices:[0,1,2,0,2,3], texCoords:[[0,1],[1,1],[1,0],[0,0]],
  }},
  materials:{glow:{kind:'emissive',radiance:[2,1,1],colorMap:'strip'}},
  nodes:[{id:'card',geometry:'card',material:'glow'}],
  textureAtlas:{resource:'atlas',decode:'surface-v2',width:3,height:1,
    regions:{strip:{x:0,y:0,width:2,height:1,wrap:'repeat'}}},
  sample({frame}){
    const x=frame===0 ? 0 : frame===1 ? -.5 : 0;
    return {camera:{projection:'orthographic',position:[x,0,2],target:[x,0,0],near:.1,far:5,viewHeight:.002}};
  },
};
export const texture=defineNativeStage(async init=>{
 const preview=await createNativeScene(init,scene);
 const path=await createNativePathTracer(init,scene,{samples:16,maxBounces:0});
 return {renderAt(c){return c.frame<2 ? preview.renderAt(c,{},{}):path.renderAt(c,{},{});},
 dispose:async()=>{await preview.dispose?.();await path.dispose?.();}};
});
export default <Composition width={1} height={1} fps={24} durationInFrames={3}>
 <Resource id="atlas" src="./atlas.json" kind="file"/>
 <Stage id="texture" factory={texture}/><Layer source={ref('texture')}/>
</Composition>;`);
  const build = await buildProject(entry);
  const renderer = await Renderer.create(build, {nativeGpu: {
    executable: resolve(executable!), dynamic: 'throughput', slots: 1, readback: 'final-surface', rayQuery: true,
  }});
  try {
    const frames = new Map<number, Float32Array>();
    for (const frame of [2,0,1,2]) {
      const pixels = pixelsFromSurface(await renderer.renderNativeSurface(frame));
      const expected = frame === 1 ? [.2,.3,2,1] : [.8,.8,3,1];
      assert.ok(expected.every((v,i) => Math.abs(v-pixels[i]) < (frame === 2 ? .003 : .00001)),
        JSON.stringify({frame,pixels:[...pixels],expected}));
      if (frames.has(frame)) assert.deepEqual(pixels,frames.get(frame));
      frames.set(frame,pixels);
    }
    assert.equal((await renderer.nativeStats()).hardwareRayQuery.cpuPixelReadbacks, 0);
  } finally { await renderer.close(); }
});
test('atlas samplers honor independent axes, mirror and nearest without neighboring-region leakage',{
 skip:executable?false:'Set FRAMEWEAVE_NATIVE_GPU to a reviewed Vulkan build',
},async()=>{
 const root=resolve('.frameweave/scene3d');
 await mkdir(root,{recursive:true});
 const dir=await mkdtemp(join(root,'sampler-')),entry=join(dir,'project.tsx');
 const texels=[1,2,999,3,4,999].flatMap(v=>[v,v*.5,v*.25,1]);
 await writeFile(join(dir,'atlas.json'),JSON.stringify(surfaceFromPixels(3,2,texels,{color:linear709,format:'rgba32float',alpha:'straight'})));
 const cases=[
  {uv:[1.25,-.25],addressU:'mirror',addressV:'repeat',filter:'nearest',expected:4},
  {uv:[-1.25,1.25],addressU:'mirror',addressV:'clamp',filter:'nearest',expected:4},
  {uv:[1.25,-.25],addressU:'repeat',addressV:'repeat',filter:'nearest',expected:3},
  {uv:[.5,1.25],addressU:'repeat',addressV:'clamp',filter:'linear',expected:3.5},
  {uv:[0,0],addressU:'repeat',addressV:'clamp',filter:'linear',expected:1.5},
  {uv:[1,1],addressU:'mirror',addressV:'mirror',filter:'linear',expected:4},
 ];
 await writeFile(entry,`
import {Composition,Layer,Resource,Stage,ref} from '@frameweave/engine';
import {createNativeScene,createNativePathTracer,defineNativeStage,type NativeScene3D} from '@frameweave/engine/native';
const cases=${JSON.stringify(cases)} as const;
export const shot=defineNativeStage(async init=>{
 const instances:Awaited<ReturnType<typeof createNativeScene>>[]=[];
 for(const item of cases) {
  const scene:NativeScene3D={
   geometries:{q:{restPositions:[[-1,-1,0],[1,-1,0],[0,1,0]],indices:[0,1,2],texCoords:[item.uv,item.uv,item.uv]}},
   materials:{m:{kind:'emissive',radiance:[1,1,1],colorMap:'tile'}},nodes:[{id:'q',geometry:'q',material:'m'}],
   textureAtlas:{resource:'atlas',width:3,height:2,decode:'surface-v2',regions:{tile:{x:0,y:0,width:2,height:2,
    addressU:item.addressU,addressV:item.addressV,filter:item.filter}}},
   sample(){return {camera:{projection:'orthographic',position:[0,0,2],target:[0,0,0],near:.1,far:3,viewHeight:.01}};}
  };
  instances.push(await createNativeScene(init,scene),await createNativePathTracer(init,scene,{samples:2,maxBounces:0}));
 }
 return {renderAt(c){return instances[c.frame].renderAt(c,{},{});},
  dispose:async()=>{for(const instance of instances)await instance.dispose?.();}};
});
export default <Composition width={1} height={1} fps={24} durationInFrames={12}>
 <Resource id="atlas" src="./atlas.json" kind="file"/><Stage id="sampler" factory={shot}/><Layer source={ref('sampler')}/>
</Composition>;`);
 const build=await buildProject(entry);
 const renderer=await Renderer.create(build,{nativeGpu:{
  executable:resolve(executable!),dynamic:'throughput',slots:1,readback:'final-surface',rayQuery:true,
 }});
 try {
  for(let i=0;i<cases.length*2;i++) {
   const pixels=pixelsFromSurface(await renderer.renderNativeSurface(i));
   const expected=cases[i>>1].expected;
   assert.ok(Math.abs(pixels[0]-expected)<1e-5,JSON.stringify({i,actual:[...pixels],expected}));
  }
 }finally{await renderer.close();}
});
