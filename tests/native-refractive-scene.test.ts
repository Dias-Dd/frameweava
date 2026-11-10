import assert from 'node:assert/strict';
import {mkdir, mkdtemp, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import test from 'node:test';
import {buildProject} from '../src/compiler/build.ts';
import {pixelsFromSurface} from '../src/media/surface.ts';
import {Renderer} from '../src/render/renderer.ts';

const executable = process.env.FRAMEWEAVE_NATIVE_GPU;

test('shared Native water and opaque meshes agree with independent Snell/Fresnel cases', {
  skip: executable ? false : 'Set FRAMEWEAVE_NATIVE_GPU to a reviewed Vulkan ray-query build',
}, async () => {
  const directory = resolve('.frameweave/refractive-scene');
  await mkdir(directory, {recursive: true});
  const entry = join(await mkdtemp(join(directory, 'optics-')), 'project.tsx');
  await writeFile(entry, `
import {BoxGeometry} from 'three';
import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {createRefractiveScene,type RefractiveSceneMesh} from '@frameweave/engine/spatial-vfx';
const box = new BoxGeometry(), position = box.getAttribute('position');
const mesh = {restPositions:Array.from({length:position.count},(_,i):[number,number,number]=>[position.getX(i),position.getY(i),position.getZ(i)]),indices:Array.from(box.index!.array)};
box.dispose();
const object=(x:number,y:number,z:number,sx:number,sy:number,sz:number,color:RefractiveSceneMesh['color']):RefractiveSceneMesh=>({mesh,color,transform:[sx,0,0,x,0,sy,0,y,0,0,sz,z]});
export const picture=defineNativeStage(init=>createRefractiveScene(init,{
 meshes:[
  object(0,-1.025,-1.50,.70,.05,.70,[1.6,.10,.20]),
  object(0,-1.025,-.12,.70,.05,.70,[.05,2,.10]),
  object(3.58,2,-.025,.30,.4,.05,[.10,.25,3]),
  object(6,2,4,.5,.5,.10,[2,.3,.1]),
  object(9,-.025,.402,.5,.05,.50,[.25,2.5,.45]),
 ],
 absorption:[.15,.10,.05], sky:{horizon:[0,0,0],zenith:[0,0,0]}, lightDirection:[0,1,0],
 sample({frame}){
  const camera={projection:'orthographic' as const,viewHeight:.20,near:.05,far:14};
  if(frame<=2)return {camera:{...camera,position:[0,2,3],target:[0,0,0]},waterLevel:frame?1:undefined,
   droplets:frame===2?[{center:[0,.25,.8],radius:.22}]:[]};
  if(frame===6)return {camera:{...camera,position:[9,.5,3],target:[9,1,3-Math.sqrt(3)/2]},waterLevel:1};
  const x=frame===5?6:3;
  return {camera:{...camera,position:[x,2,5],target:[x,2,0]},
   droplets:frame===4?[]:[{center:[x+.3,2,2.7],radius:.75}]};
 }
}));
export default <Composition width={9} height={9} fps={24} durationInFrames={7} background="#000000">
 <Stage id="optics" factory={picture}/><Layer source={ref('optics')}/>
</Composition>;`);

  const build = await buildProject(entry);
  const nativeGpu = {executable: resolve(executable!), dynamic: 'throughput', slots: 1, readback: 'final-surface'} as const;
  await assert.rejects(async () => {
    const denied = await Renderer.create(build, {nativeGpu});
    try {
      await denied.renderNativeSurface(0);
    } finally {
      await denied.close();
    }
  }, {code: 'E_NATIVE_RAY_PERMISSION'});
  const renderer = await Renderer.create(build, {nativeGpu: {...nativeGpu, rayQuery: true}});
  try {
    const frames = new Map<number, Float32Array>();
    for (const frame of [1, 3, 0, 2, 4, 5, 6, 1]) {
      const pixels = pixelsFromSurface(await renderer.renderNativeSurface(frame));
      const previous = frames.get(frame);
      if (previous) assert.deepEqual(pixels, previous, 'out-of-order repeated frame');
      frames.set(frame, pixels);
    }
    assert.deepEqual(frames.get(1), frames.get(2), 'a fully submerged droplet adds no internal interface');

    const transmission = (cosIn: number, cosOut: number, index: number) => {
      const rs = (cosIn - index * cosOut) / (cosIn + index * cosOut);
      const rp = (index * cosIn - cosOut) / (index * cosIn + cosOut);
      return 1 - (rs ** 2 + rp ** 2) / 2;
    };
    const attenuated = (rgb: number[], scale: number, meters: number) =>
      rgb.map((v, i) => v * scale * Math.exp(-[.15, .10, .05][i] * meters));
    const n = 1.333;
    const planeIn = 2 / Math.sqrt(13);
    const planeOut = Math.sqrt(1 - (1 - planeIn ** 2) / n ** 2);
    const sphereIn = Math.sqrt(1 - (.3 / .75) ** 2);
    const sphereOut = Math.sqrt(1 - (.3 / .75 / n) ** 2);
    const expected = [
      [1.6, .10, .20],
      attenuated([.05, 2, .10], transmission(planeIn, planeOut, n), 2 / planeOut),
      attenuated([.05, 2, .10], transmission(planeIn, planeOut, n), 2 / planeOut),
      attenuated([.10, .25, 3], .28 * transmission(sphereIn, sphereOut, n) ** 2, 1.5 * sphereOut),
      [0, 0, 0],
      [2, .30, .10].map(v => v * .28),
      attenuated([.25, 2.5, .45], 1, 3 - .05),
    ];
    let maxError = 0;
    for (const [frame, rgb] of expected.entries()) {
      const actual = [...frames.get(frame)!.slice(40 * 4, 41 * 4)];
      assert.equal(actual[3], 1, `opaque alpha, frame ${frame}`);
      const error = Math.max(...rgb.map((v, i) => Math.abs(v - actual[i])));
      maxError = Math.max(maxError, error);
      assert.ok(error < .0005, JSON.stringify({frame, expected: rgb, actual, error}));
    }
    const stats = await renderer.nativeStats();
    assert.equal(stats.hardwareRayQuery.runtimeVerified, true);
    assert.equal(stats.hardwareRayQuery.cpuGeometryReadbacks, 0);
    assert.equal(stats.hardwareRayQuery.completedRays, 8 * 9 * 9 * 5);
    console.log(JSON.stringify({maxError, frames: expected.length, adapter: stats.adapter}));
  } finally {
    await renderer.close();
  }
});
