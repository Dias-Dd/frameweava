import {EngineError} from '../../src/core/errors.ts';
import type {FrameContext} from '../../src/core/types.ts';
import {linear709} from '../../src/media/surface.ts';
import {withGpuResources} from '../gpu-effects/resource-arena.ts';
import type {GpuComputeBinding, GpuDataBuffer} from '../gpu-effects/compute-types.ts';
import type {MeshData} from '../graphics-contracts/types.ts';
import type {NativeStageInit, NativeStageInstance} from '../native-gpu/authoring.ts';
import {camera} from '../skeletal-effects/src/renderer.ts';
import type {SpatialCamera} from '../spatial-data-effects/src/types.ts';
import {advanceRefractiveRays, seedRefractiveRays} from './refractive-shaders.ts';

type Triple = readonly [number, number, number];

export interface RefractiveSceneMesh {
  mesh: Pick<MeshData, 'restPositions' | 'indices'>;
  /** Scene-linear Rec.709 diffuse RGB. Values may exceed one. */
  color: Triple;
  /** Same row-major affine 3×4 transform as NativeRayGeometry. */
  transform?: readonly number[];
}

export interface RefractiveSceneSample {
  camera: SpatialCamera;
  /** World-space spheres in meters. Spheres and the liquid half-space share one medium. */
  droplets?: readonly {center: Triple; radius: number}[];
  /** World-space Y of the liquid surface. Omit to use droplets only. */
  waterLevel?: number;
}

export interface RefractiveSceneOptions {
  meshes: readonly RefractiveSceneMesh[];
  sample: (context: FrameContext) => RefractiveSceneSample;
  ior?: number;
  /** Beer–Lambert extinction coefficient per meter, scene-linear RGB. */
  absorption?: Triple;
  sky?: {horizon: Triple; zenith: Triple};
  lightDirection?: Triple;
  /** Transport quality limit. Unresolved paths are visibly magenta. */
  maxInterfaces?: number;
  rayEpsilon?: number;
  format?: 'rgba16float' | 'rgba32float';
}

const read = (type: 'u32' | 'f32'): GpuComputeBinding => ({type, access: 'read'});
const write: GpuComputeBinding = {type: 'f32', access: 'read_write'};

function inputError(message: string): never {
  throw new EngineError('E_REFRACTIVE_SCENE_INPUT', message);
}

function triple(value: Triple, label: string, nonnegative = false): Triple {
  if (value.length !== 3 || value.some(v => !Number.isFinite(Math.fround(v)) || nonnegative && v < 0))
    inputError(`Expected finite ${label}`);
  return [...value];
}

/** One Native Stage owns all geometry, ray state and the resulting Surface. */
export async function createRefractiveScene(
  {gpu, width, height}: NativeStageInit, options: RefractiveSceneOptions,
): Promise<NativeStageInstance> {
  const maxInterfaces = options.maxInterfaces ?? 4;
  const epsilon = Math.fround(options.rayEpsilon ?? 0.0001);
  const ior = Math.fround(options.ior ?? 1.333);
  if (!options.meshes.length || typeof options.sample !== 'function' ||
      !Number.isSafeInteger(maxInterfaces) || maxInterfaces < 0 ||
      !Number.isFinite(epsilon) || epsilon <= 0 || !Number.isFinite(ior) || ior < 1)
    inputError('Expected opaque geometry, a frame sampler, a positive ray epsilon and valid transport options');
  const {sample, format = 'rgba32float'} = options;
  const absorption = triple(options.absorption ?? [.32, .1, .045], 'nonnegative absorption', true);
  const horizon = triple(options.sky?.horizon ?? [.12, .35, .53], 'sky horizon RGB', true);
  const zenith = triple(options.sky?.zenith ?? [.48, .79, 1.35], 'sky zenith RGB', true);
  const light = triple(options.lightDirection ?? [-.5, .8, .6], 'light direction');
  const lightLength = Math.hypot(...light);
  if (lightLength === 0) inputError('Light direction cannot be zero');
  const pixels = width * height;
  const limits = gpu.capabilities().limits;
  if (!Number.isSafeInteger(pixels * 8) || pixels * 32 > limits.maxStorageBufferBindingSize ||
      pixels * 32 > limits.maxBufferSize)
    throw new EngineError('E_REFRACTIVE_SCENE_CAPACITY', 'Scene ray state exceeds the device storage binding limit');

  const seed = await gpu.compileCompute({
    abiVersion: 1, id: 'frameweave/spatial/refractive-seed', version: '1.0.0',
    bindings: [write, write, write], parameterWords: 23, workgroupSize: [8, 8, 1], code: seedRefractiveRays,
  });
  const advance = await gpu.compileCompute({
    abiVersion: 1, id: 'frameweave/spatial/refractive-advance', version: '1.0.0',
    bindings: [write, write, write, read('u32'), read('f32'), read('f32'), read('f32'), read('f32')],
    parameterWords: 19, workgroupSize: [8, 8, 1], code: advanceRefractiveRays,
  });
  const present = await gpu.compile({
    abiVersion: 2, id: 'frameweave/spatial/refractive-surface', version: '1.0.0',
    inputCount: 0, dataInputs: [{type: 'f32'}], parameterWords: 0,
    code: 'fn pixel(p:vec2u)->vec4f{let i=(p.y*outputSize().x+p.x)*8u;return vec4f(data0(i),data0(i+1u),data0(i+2u),1.);}',
  });
  const prepared = await withGpuResources(gpu, async arena => {
    const buffers = new Map<RefractiveSceneMesh['mesh'], {positions: GpuDataBuffer; indices: GpuDataBuffer}>();
    const geometry = [];
    const materials = new Float32Array(options.meshes.length * 4);
    for (const [id, object] of options.meshes.entries()) {
      const {mesh, transform} = object;
      materials.set(triple(object.color, 'opaque mesh RGB', true), id * 4);
      let entry = buffers.get(mesh);
      if (!entry) {
        if (mesh.restPositions.length < 3 || mesh.indices.length < 3 || mesh.indices.length % 3 ||
            mesh.indices.some(i => !Number.isInteger(i) || i < 0 || i >= mesh.restPositions.length))
          inputError('Expected indexed triangle geometry');
        const positions = new Float32Array(mesh.restPositions.length * 3);
        for (const [index, position] of mesh.restPositions.entries())
          positions.set(triple(position, 'mesh position'), index * 3);
        entry = {
          positions: arena.buffer(await gpu.createField({
            type: 'f32', dimensions: [mesh.restPositions.length, 1, 1], components: 3,
            semantic: 'position', space: 'world', units: 'meter',
          }, positions)),
          indices: arena.buffer(await gpu.createBuffer({type: 'u32', length: mesh.indices.length}, Uint32Array.from(mesh.indices))),
        };
        buffers.set(mesh, entry);
      }
      geometry.push({...entry, id, transform});
    }
    const palette = arena.buffer(await gpu.createBuffer({type: 'f32', length: materials.length}, materials));
    const scene = await gpu.createRayScene({version: 1, geometries: geometry, invalidGeometry: 'discard', quality: 'trace'});
    const owned = [palette, ...Array.from(buffers.values()).flatMap(b => [b.positions, b.indices])];
    owned.forEach(buffer => arena.keep(buffer));
    return {scene, palette, owned};
  });

  let closed = false;
  return {
    async renderAt(context) {
      if (closed) throw new EngineError('E_REFRACTIVE_SCENE_CLOSED', 'The refractive scene is disposed');
      const frame = sample(context);
      const view = camera(frame.camera, width, height);
      const scaleX = 1 / view.projectionMatrix.elements[0];
      const scaleY = 1 / view.projectionMatrix.elements[5];
      const perspective = frame.camera.projection === 'perspective';
      const rayFar = Math.fround(frame.camera.far * (perspective ? Math.hypot(1, scaleX, scaleY) : 1));
      if (!Number.isFinite(rayFar) || rayFar <= epsilon) inputError('Camera far distance is outside the ray interval');
      const cameraWords = new Float32Array(23);
      cameraWords.set(view.matrixWorld.elements);
      cameraWords.set([scaleX, scaleY, frame.camera.near, frame.camera.far], 16);
      new Uint32Array(cameraWords.buffer).set([Number(perspective), width, height], 20);
      const droplets = frame.droplets ?? [];
      const water = new Float32Array(Math.max(1, droplets.length) * 4);
      if (frame.waterLevel !== undefined && !Number.isFinite(Math.fround(frame.waterLevel)))
        inputError('Expected a finite water level');
      for (const [index, {center, radius}] of droplets.entries()) {
        const r = Math.fround(radius);
        if (!Number.isFinite(r) || r <= 4 * epsilon) inputError('Droplet radius must exceed four ray epsilons');
        water.set([...triple(center, 'droplet center'), r], index * 4);
      }
      const optical = new Float32Array(19);
      const flags = new Uint32Array(optical.buffer);
      optical.set([frame.waterLevel ?? 0, ior, ...absorption, epsilon]);
      optical.set([...horizon, ...zenith, ...light.map(v => v / lightLength)], 8);
      flags[6] = droplets.length;
      flags[17] = Number(frame.waterLevel !== undefined);
      flags[18] = width;
      return withGpuResources(gpu, async arena => {
        const newRay = async () => arena.buffer(await gpu.createField({
          type: 'f32', dimensions: [width, height, 1], components: 3, semantic: 'generic',
        }));
        const origins = await newRay();
        const directions = await newRay();
        const state = arena.buffer(await gpu.createBuffer({type: 'f32', length: pixels * 8}));
        const shapes = arena.buffer(await gpu.createBuffer({type: 'f32', length: water.length}, water));
        const workItems = [width, height, 1] as const;
        await gpu.dispatch(seed, [origins, directions, state], {workItems, parameters: cameraWords});
        for (let interaction = 0; interaction <= maxInterfaces; interaction++) {
          const result = await gpu.traceRayScene(prepared.scene, {version: 1, origins, directions, tMin: epsilon, tMax: rayFar});
          flags[7] = Number(interaction === maxInterfaces);
          await gpu.dispatch(advance, [
            origins, directions, state, arena.buffer(result.hits), arena.buffer(result.measurements),
            arena.buffer(result.normals), shapes, prepared.palette,
          ], {workItems, parameters: optical});
        }
        return gpu.run(present, [], {data: [state], output: {width, height, format, color: linear709, alpha: 'opaque'}});
      });
    },
    async dispose() {
      if (closed) return;
      closed = true;
      await gpu.releaseRayScene(prepared.scene);
      for (const buffer of prepared.owned) await gpu.releaseBuffer(buffer);
    },
  };
}
