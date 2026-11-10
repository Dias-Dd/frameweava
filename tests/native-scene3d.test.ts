import assert from 'node:assert/strict';
import {mkdir, mkdtemp, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import test from 'node:test';
import {buildProject} from '../src/compiler/build.ts';
import {pixelsFromSurface} from '../src/media/surface.ts';
import {Renderer} from '../src/render/renderer.ts';
import {prepareScene3D} from '../modules/native-gpu/scene.ts';
import type {NativeStageInit} from '../modules/native-gpu/authoring.ts';

test('scene parent cycles and invalid materials reject before GPU allocation', async () => {
  const init = {width: 3, height: 3} as NativeStageInit;
  const scene = {geometries: {}, materials: {}, sample: () => {throw Error('not sampled');}};
  await assert.rejects(prepareScene3D(init, {
    ...scene, nodes: [{id: 'a', parent: 'b'}, {id: 'b', parent: 'a'}],
  }), {code: 'E_NATIVE_SCENE', message: 'Cyclic scene node hierarchy'});
  await assert.rejects(prepareScene3D(init, {
    ...scene, materials: {paint: {kind: 'diffuse', color: [1.1, .2, .1]}}, nodes: [],
  }), {code: 'E_NATIVE_SCENE'});
});

const executable = process.env.FRAMEWEAVE_NATIVE_GPU;
test('Native 3D resolves shared geometry, materials, parent poses and frame-owned GPU geometry', {
  skip: executable ? false : 'Set FRAMEWEAVE_NATIVE_GPU to the reviewed Vulkan build',
}, async () => {
  const root = resolve('.frameweave/scene3d');
  await mkdir(root, {recursive: true});
  const entry = join(await mkdtemp(join(root, 'scene-')), 'project.tsx');
  await writeFile(entry, `
import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {createNativeScene,defineNativeStage,type SceneTransform,type SceneGeometry} from '@frameweave/engine/native';
const shift=(x:number,z:number):SceneTransform=>[1,0,0,x,0,1,0,0,0,0,1,z];
const tri:SceneGeometry={restPositions:[[-1,-1,0],[1,-1,0],[0,1,0]],indices:[0,1,2]};
export const picture=defineNativeStage(init=>createNativeScene(init,{
 geometries:{tri,live:{gpu:async()=>({positions:await init.gpu.createField(
  {type:'f32',dimensions:[3,1,1],components:3,semantic:'position',space:'world',units:'meter'},
  Float32Array.of(-1,-1,0,1,-1,0,0,1,0))})}},
 materials:{red:{kind:'emissive',radiance:[3,.25,.125]},blue:{kind:'emissive',radiance:[.125,.5,2]},green:{kind:'emissive',radiance:[.25,4,.5]}},
 nodes:[{id:'child',parent:'parent',geometry:'tri',material:'red',transform:shift(0,1)},
  {id:'parent'}, {id:'back',geometry:'tri',material:'blue'}, {id:'dynamic',geometry:'live',material:'green',transform:shift(3,1)}],
 sample({frame}){
  const x=frame===2?3:0;
  return {camera:{projection:'orthographic',position:[x,0,4],target:[x,0,0],near:.05,far:8,viewHeight:.4},
   transforms:{parent:shift(frame===1?3:0,0)}};
 }
}));
export default <Composition width={3} height={3} fps={24} durationInFrames={3} background="#000000">
 <Stage id="scene" factory={picture}/><Layer source={ref('scene')}/>
</Composition>;`);
  const build = await buildProject(entry);
  const renderer = await Renderer.create(build, {nativeGpu: {
    executable: resolve(executable!), dynamic: 'throughput', slots: 1, readback: 'final-surface', rayQuery: true,
  }});
  try {
    const expected = [[3,.25,.125,1],[.125,.5,2,1],[.25,4,.5,1]];
    for (const frame of [2,0,1,2]) {
      const pixels = pixelsFromSurface(await renderer.renderNativeSurface(frame));
      assert.deepEqual([...pixels.slice(16,20)], expected[frame]);
    }
    assert.equal((await renderer.nativeStats()).hardwareRayQuery.runtimeVerified, true);
  } finally {
    await renderer.close();
  }
});
