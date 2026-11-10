import assert from 'node:assert/strict';
import {mkdir, mkdtemp, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import test from 'node:test';
import {buildProject} from '../src/compiler/build.ts';
import {pixelsFromSurface} from '../src/media/surface.ts';
import {NativeRecordingScope} from '../modules/native-gpu/scope.ts';
import {Renderer} from '../src/render/renderer.ts';

test('ray scratch reuse checks ownership and rebuilds only after geometry writes', async () => {
  const scope = new NativeRecordingScope(), gpu = scope.api;
  const immutable = await gpu.createBuffer({type: 'f32', length: 4}, Float32Array.of(0,0,0,0));
  scope.sealInitialization();
  scope.beginFrame();
  const xyz = {type: 'f32', dimensions: [1,1,1], components: 3, semantic: 'generic'} as const;
  const positions = await gpu.createField({...xyz, dimensions: [3,1,1]}, Float32Array.of(-1,-1,0,1,-1,0,0,1,0));
  const origins = await gpu.createField(xyz, Float32Array.of(0,0,2));
  const directions = await gpu.createField(xyz, Float32Array.of(0,0,-1));
  const scene = await gpu.createRayScene({version: 1, invalidGeometry: 'discard', geometries: [{positions}]});
  const args = {version: 1, origins, directions} as const;
  const {hits, measurements, normals} = await gpu.traceRayScene(scene, args);
  const output = {hits, measurements, normals};
  await assert.rejects(gpu.traceRayScene(scene, {...args, output: {...output, normals: measurements}}), {code: 'E_NATIVE_RAY_OUTPUT'});
  await assert.rejects(gpu.traceRayScene(scene, {...args, output: {...output, normals: immutable}}), {code: 'E_NATIVE_RAY_OUTPUT'});
  await gpu.writeBuffer(directions, Float32Array.of(0,0,-1));
  const second = await gpu.traceRayScene(scene, {...args, output});
  assert.equal(second.hits, hits);
  await gpu.writeBuffer(positions, Float32Array.of(-1,-1,-1), 0);
  await gpu.traceRayScene(scene, {...args, output});
  const passes = scope.packet(false).passes;
  assert.equal(passes.filter(p => p.rayBuild).length, 2);
  const query = passes.flatMap(p => p.rayQuery === undefined ? [] : [p]);
  assert.equal(query.length, 3);
  assert.equal(query[0].rayQuery, query[1].rayQuery);
  assert.notEqual(query[1].rayQuery, query[2].rayQuery);
  assert.deepEqual(query.map(p => p.buffers!.slice(2)), Array(3).fill(query[0].buffers!.slice(2)));
});

const executable = process.env.FRAMEWEAVE_NATIVE_GPU;
test('hardware paths preserve indirect diffuse, mirror emission, nested media and shadow visibility', {
  skip: executable ? false : 'Set FRAMEWEAVE_NATIVE_GPU to a reviewed Vulkan build',
}, async () => {
  const root = resolve('.frameweave/scene3d');
  await mkdir(root, {recursive: true});
  const entry = join(await mkdtemp(join(root, 'transport-')), 'project.tsx');
  await writeFile(entry, `
import {BoxGeometry} from 'three';
import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {createNativePathTracer,defineNativeStage,type SceneGeometry,type SceneNode} from '@frameweave/engine/native';
const box=new BoxGeometry(), p=box.getAttribute('position');
const cube:SceneGeometry={restPositions:Array.from({length:p.count},(_,i)=>[p.getX(i),p.getY(i),p.getZ(i)]),indices:Array.from(box.index!.array)};
box.dispose();
const slab=(id:string,material:string,x:number,z:number,sx=2,sz=.1):SceneNode=>({id,material,geometry:'cube',
 transform:[sx,0,0,x,0,2,0,0,0,0,sz,z]});
export const picture=defineNativeStage(init=>createNativePathTracer(init,{
 geometries:{cube},
 materials:{
  matte:{kind:'diffuse',color:[.2,.5,.8]},
  mirror:{kind:'metal',color:[.5,.25,.125],roughness:0},
  outer:{kind:'dielectric',ior:1,absorption:[.2,.3,.4]},
  inner:{kind:'dielectric',ior:1,absorption:[.7,.1,.2]},
  bent:{kind:'dielectric',ior:1.333},
  glow:{kind:'emissive',radiance:[2,3,4]},
  red:{kind:'emissive',radiance:[6,0,0]},
  green:{kind:'emissive',radiance:[0,6,0]},
  black:{kind:'diffuse',color:[0,0,0]},
 },
 nodes:[slab('diffuse','matte',0,0),slab('mirror','mirror',5,0),
  slab('behind-camera','glow',5,7.5),slab('glass','outer',10,0,2,2),
  slab('inner','inner',10,0,1.5,1),slab('behind-glass','glow',10,-2),
  slab('in-shadow','matte',15,0),
  {...slab('blocker','black',16,1.05),transform:[.1,0,0,16,0,.1,0,0,0,0,.1,1.05]},
  slab('water-bend','bent',21.85,0,3,2),
  slab('refracted-target','green',22.71,-2,.14),slab('straight-target','red',23,-2,.14)],
 environment:{lower:[.25,.5,1.25],upper:[.25,.5,1.25]},
 sun:{direction:[1,0,1],radiance:[Math.PI,Math.PI,Math.PI]},
 sample({frame}){
  const x=frame*5;
  return {camera:{projection:'orthographic',position:[x,0,4],target:[frame===4?x+2:x,0,0],near:.05,far:18,viewHeight:.002}};
 }
},{samples:8,maxBounces:4}));
export default <Composition width={3} height={3} fps={24} durationInFrames={5} background="#000000">
 <Stage id="path" factory={picture}/><Layer source={ref('path')}/>
</Composition>;`);
  const build = await buildProject(entry);
  const renderer = await Renderer.create(build, {nativeGpu: {
    executable: resolve(executable!), dynamic: 'throughput', slots: 1, readback: 'final-surface', rayQuery: true,
  }});
  try {
    const color = [.2,.5,.8], sky = [.25,.5,1.25];
    const expected = [
      color.map((v, i) => v * (sky[i] + Math.SQRT1_2)),
      [1,.75,.5],
      [2,3,4].map((v, i) => v * Math.exp(-[.9,.4,.6][i])),
      color.map((v, i) => v * sky[i]),
    ];
    const frames = new Map<number, Float32Array>();
    let maxError = 0;
    for (const frame of [2,0,3,1,4,2]) {
      const pixels = pixelsFromSurface(await renderer.renderNativeSurface(frame));
      if (frames.has(frame)) assert.deepEqual(pixels, frames.get(frame));
      frames.set(frame, pixels);
      const center = [...pixels.slice(16,20)];
      assert.equal(center[3], 1);
      if (frame === 4) {
        assert.ok(center[1] > 4 && center[0] < .3, 'Snell deflection must hit the green target instead of the straight ray red target');
        continue;
      }
      const error = Math.max(...expected[frame].map((v, i) => Math.abs(v - center[i])));
      maxError = Math.max(maxError, error);
      assert.ok(error < .0005, JSON.stringify({frame, center, expected: expected[frame], error}));
    }
    const stats = await renderer.nativeStats();
    assert.equal(stats.hardwareRayQuery.runtimeVerified, true);
    assert.equal(stats.hardwareRayQuery.geometryBuilds, 1);
    assert.equal(stats.hardwareRayQuery.cpuGeometryReadbacks, 0);
    assert.equal(stats.hardwareRayQuery.completedRays, 6 * 9 * 8 * 5 * 2);
    console.log(JSON.stringify({maxError, hardware: stats.hardwareRayQuery}));
  } finally {
    await renderer.close();
  }
});
