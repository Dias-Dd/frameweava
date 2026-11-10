import type {NativeStageInit, NativeStageInstance} from './authoring.ts';
import {prepareScene3D, sceneWrite, type NativeScene3D} from './scene.ts';
import {withGpuResources} from '../gpu-effects/resource-arena.ts';
import {linear709} from '../../src/media/surface.ts';
import {cameraRays, directSceneSurface} from './scene-shaders.ts';
import {frameTextureAtlas} from './scene-textures.ts';

export interface NativeSceneRenderOptions {
  format?: 'rgba16float' | 'rgba32float';
  rayEpsilon?: number;
}

export function cameraParameters(frame: Awaited<ReturnType<Awaited<ReturnType<typeof prepareScene3D>>['frame']>>,
    width: number, height: number, jitter = 0) {
  const words = new Float32Array(24);
  words.set(frame.view.matrixWorld.elements);
  const sx = 1 / frame.view.projectionMatrix.elements[0], sy = 1 / frame.view.projectionMatrix.elements[5];
  const perspective = frame.camera.projection === 'perspective';
  words.set([sx, sy, frame.camera.near, frame.camera.far], 16);
  new Uint32Array(words.buffer).set([Number(perspective), width, height, jitter], 20);
  return {words, far: frame.camera.far * (perspective ? Math.hypot(1, sx, sy) : 1)};
}

/** Deterministic first-hit view of a shared Native 3D scene. */
export async function createNativeScene(init: NativeStageInit, scene: NativeScene3D,
    options: NativeSceneRenderOptions = {}): Promise<NativeStageInstance> {
  const {gpu, width, height} = init;
  const atlasStorage=scene.textureAtlas?.decode==='rgba32float-le'?'u32':'f32';
  const rayEpsilon = options.rayEpsilon ?? .0001;
  const seed = await gpu.compileCompute({
    abiVersion: 1, id: 'frameweave/scene/camera-rays', version: '1.0.0',
    bindings: [sceneWrite, sceneWrite], parameterWords: 24, workgroupSize: [8, 8, 1], code: cameraRays,
  });
  const display = await gpu.compile({
    abiVersion: 2, id: 'frameweave/scene/direct', version: '1.0.0', inputCount: 0,
    dataInputs: [{type: 'u32'}, {type: 'f32'}, {type: 'f32'}, {type: 'f32'}, {type: 'f32'}, {type:'u32'}, {type:atlasStorage}, {type:'f32'}],
    parameterWords: 17, code: directSceneSurface(atlasStorage),
  });
  const prepared = await prepareScene3D(init, scene);
  return {
    async renderAt(context) {
      return withGpuResources(gpu, async arena => {
        const frame = await prepared.frame(context,arena);
        arena.adopt(frame.scene, s => gpu.releaseRayScene(s));
        const field = async () => arena.buffer(await gpu.createField({
          type: 'f32', dimensions: [width, height, 1], components: 3, semantic: 'generic',
        }));
        const origins = await field(), directions = await field();
        const camera = cameraParameters(frame, width, height);
        await gpu.dispatch(seed, [origins, directions], {workItems: [width, height, 1], parameters: camera.words});
        const atlas = await frameTextureAtlas(gpu, arena, prepared.textureAtlas, prepared.emptyTexture);
        const coverage=prepared.hasCoverage?{version:2 as const,layout:frame.textureLayout,texels:atlas,
          seed:(context.seed^Math.imul(context.globalFrame+1,0x41c6a72b))>>>0}:undefined;
        const hit = await gpu.traceRayScene(frame.scene, {version:1,origins,directions,tMin:rayEpsilon,tMax:camera.far,coverage});
        const transforms = arena.buffer(await gpu.createBuffer({type:'f32',length:frame.shadingWords.length},frame.shadingWords));
        const data = [arena.buffer(hit.hits), arena.buffer(hit.measurements), arena.buffer(hit.normals), directions, prepared.palette,
          frame.textureLayout, atlas, transforms];
        const lighting = Float32Array.of(...prepared.lighting, -camera.words[8], -camera.words[9],
          -camera.words[10], camera.words[19] - camera.words[18],0);
        new Uint32Array(lighting.buffer)[16]=prepared.environmentRegion;
        return gpu.run(display, [], {data, parameters: lighting, output: {
          width, height, format: options.format ?? 'rgba32float', alpha: 'opaque', color: linear709,
        }});
      });
    },
    dispose: () => prepared.dispose(),
  };
}
