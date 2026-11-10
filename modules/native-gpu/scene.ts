import {EngineError} from '../../src/core/errors.ts';
import type {FrameContext} from '../../src/core/types.ts';
import type {MeshData} from '../graphics-contracts/types.ts';
import type {GpuDataBuffer} from '../gpu-effects/compute-types.ts';
import {withGpuResources} from '../gpu-effects/resource-arena.ts';
import {camera} from '../skeletal-effects/src/renderer.ts';
import type {SpatialCamera} from '../spatial-data-effects/src/types.ts';
import type {NativeStageInit} from './authoring.ts';
import type {NativeRayGeometry} from './rays.ts';
import {sceneTextureLayout, type SceneTextureAtlas} from './scene-textures.ts';
import {type SceneVolume} from './scene-volume.ts';
import {sceneVolumeLayout} from './scene-volume-grid.ts';
import {emitterTable, type SceneEmitter} from './scene-lights.ts';
import {frameShadingMatrix} from './scene-shading.ts';
import type {SceneEnvironmentImportance} from './scene-environment.ts';
import {compileDynamicShading} from './scene-dynamic-shading.ts';
import type {GpuResourceArena} from '../gpu-effects/resource-arena.ts';

export type SceneRgb = readonly [number, number, number];
export type SceneTransform = readonly [
  number, number, number, number, number, number, number, number, number, number, number, number,
];
export interface SceneMapCoordinates {
  /** Named UV set; omitted selects texCoords. */
  set?:string;
  offset?:readonly [number,number];
  scale?:readonly [number,number];
  rotation?:number;
}
export type SceneMaterial = (
  | {kind: 'diffuse'; color: SceneRgb; colorMap?: string}
  | {kind: 'metal'; color: SceneRgb; roughness?: number; colorMap?: string; roughnessMap?: string}
  | {kind: 'dielectric'; ior?: number; absorption?: SceneRgb; roughness?: number; roughnessMap?: string}
  | {kind: 'pbr'; color: SceneRgb; metallic?: number; roughness?: number; ior?: number;
      colorMap?: string; metallicRoughnessMap?: string; emission?: SceneRgb; emissionMap?: string;
      /** Thin-surface optical transmission, independent of Alpha coverage. */
      transmission?:number;transmissionMap?:string}
  | {kind: 'unlit'; color: SceneRgb; colorMap?: string}
  | {kind: 'emissive'; radiance: SceneRgb; colorMap?: string}
) & {normalMap?: string; normalScale?: number;occlusionMap?:string;occlusionStrength?:number;
  coordinates?:Partial<Record<'color'|'roughness'|'normal'|'emission'|'occlusion'|'transmission',SceneMapCoordinates>>;
  alphaMode?:'opaque'|'mask'|'blend';opacity?:number;alphaCutoff?:number;doubleSided?:boolean};
export type SceneUvTopology = Pick<MeshData, 'indices'> & {
  texCoords?: readonly (readonly [number, number])[];
  vertexCount?: number;
  texCoordSets?:Readonly<Record<string,readonly (readonly [number,number])[]>>;
  colors?:readonly (readonly [number,number,number,number])[];
  tangents?:readonly (readonly [number,number,number,number])[];
};
export type SceneGeometry = (Pick<MeshData, 'restPositions' | 'indices'> & Partial<Pick<SceneUvTopology, 'texCoords'|'texCoordSets'|'colors'|'tangents'>> &
  {normals?: readonly SceneRgb[]}) |
  {gpu: (context: FrameContext, arena: GpuResourceArena) => SceneGpuMesh | Promise<SceneGpuMesh>; uvTopology?: SceneUvTopology; deformedNormals?: boolean;deformedTangents?:boolean};
export type SceneGpuMesh = Pick<NativeRayGeometry, 'positions' | 'indices' | 'count'> & {normals?: GpuDataBuffer;tangents?:GpuDataBuffer};
export interface SceneNode {
  id: string;
  parent?: string;
  transform?: SceneTransform;
  geometry?: string;
  material?: string;
}
export interface SceneSample {
  camera: SpatialCamera;
  transforms?: Readonly<Record<string, SceneTransform>>;
}
export interface NativeScene3D {
  geometries: Readonly<Record<string, SceneGeometry>>;
  materials: Readonly<Record<string, SceneMaterial>>;
  nodes: readonly SceneNode[];
  textureAtlas?: SceneTextureAtlas;
  /** World-space participating media consumed by the path tracer. */
  volumes?: readonly SceneVolume[];
  sample: (context: FrameContext) => SceneSample;
  environment?: {lower: SceneRgb; upper: SceneRgb; map?:string; importance?:SceneEnvironmentImportance};
  sun?: {direction: SceneRgb; radiance: SceneRgb};
}

const identity: SceneTransform = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
export const sceneRead = {type: 'f32', access: 'read'} as const;
export const sceneWrite = {type: 'f32', access: 'read_write'} as const;

function fail(message: string): never {
  throw new EngineError('E_NATIVE_SCENE', message);
}
function finite(value: number, label: string, min = -Infinity, max = Infinity) {
  if (typeof value !== 'number' || !Number.isFinite(Math.fround(value)) || value < min || value > max)
    fail(`Invalid ${label}`);
  return Math.fround(value);
}
function rgb(value: SceneRgb, label: string, maximum = Infinity) {
  if (!Array.isArray(value) || value.length !== 3) fail(`Expected three channels for ${label}`);
  return Array.from(value, v => finite(v, label, 0, maximum));
}
function matrix(value: SceneTransform = identity): SceneTransform {
  if (!Array.isArray(value) || value.length !== 12) fail('Transforms must be row-major affine 3×4 matrices');
  return Array.from(value, v => finite(v, 'transform')) as unknown as SceneTransform;
}
function compose(a: SceneTransform, b: SceneTransform): SceneTransform {
  return matrix(Array.from({length: 12}, (_, i) => {
    const row = i - i % 4, col = i % 4;
    return a[row] * b[col] + a[row + 1] * b[col + 4] + a[row + 2] * b[col + 8] +
      (col === 3 ? a[row + 3] : 0);
  }) as unknown as SceneTransform);
}
function materialWords(material: SceneMaterial): number[] {
  switch (material.kind) {
    case 'diffuse': return [...rgb(material.color, 'diffuse reflectance', 1), 0, 0, 0, 0, 0];
    case 'metal': return [...rgb(material.color, 'metal reflectance', 1), 1, finite(material.roughness ?? .2, 'metal roughness', 0, 1), 0, 0, 0];
    case 'dielectric': return [...rgb(material.absorption ?? [0, 0, 0], 'extinction per meter'), 2, finite(material.ior ?? 1.5, 'refractive index', 1), finite(material.roughness ?? 0,'dielectric roughness',0,1), 0, 0];
    case 'pbr': return [...rgb(material.color,'PBR base color',1),4,finite(material.roughness??1,'PBR roughness',0,1),finite(material.metallic??0,'PBR metalness',0,1),finite(material.ior??1.5,'refractive index',1),finite(material.transmission??0,'thin transmission',0,1)];
    case 'unlit': return [...rgb(material.color,'unlit color',1),5,0,0,0,0];
    case 'emissive': return [...rgb(material.radiance, 'emission radiance'), 3, 0, 0, 0, 0];
    default: return fail('Unknown scene material kind');
  }
}

/** Internal adapter from scene data to the existing Stage-owned hardware query API. */
export async function prepareScene3D(init: NativeStageInit, scene: NativeScene3D, sampleEmitters = false) {
  const {gpu} = init;
  const materials = new Map(Object.entries(scene.materials).map(([id, material]) => [id, materialWords(material)]));
  const geometry = new Map(Object.entries(scene.geometries));
  const nodes = scene.nodes.map(node => ({...node, transform: matrix(node.transform)}));
  const byId = new Map(nodes.map(node => [node.id, node]));
  if (byId.size !== nodes.length || nodes.some(n => !n.id)) fail('Scene node IDs must be nonempty and unique');
  const ordered: typeof nodes = [];
  const active = new Set<string>(), visited = new Set<string>();
  function visit(node: (typeof nodes)[number]) {
    if (visited.has(node.id)) return;
    if (active.has(node.id)) fail('Cyclic scene node hierarchy');
    active.add(node.id);
    if (node.parent !== undefined) {
      const parent = byId.get(node.parent);
      if (!parent) fail(`Unknown parent node ${node.parent}`);
      visit(parent);
    }
    active.delete(node.id);
    visited.add(node.id);
    ordered.push(node);
  }
  for (const node of nodes) {
    if ((node.geometry === undefined) !== (node.material === undefined) ||
        node.geometry !== undefined && (!geometry.has(node.geometry) || !materials.has(node.material!)))
      fail(`Node ${node.id} requires a known geometry and material together`);
    visit(node);
  }
  const meshes = ordered.filter(node => node.geometry !== undefined);
  if (!meshes.length) fail('At least one renderable scene node is required');
  const direction = scene.sun?.direction ?? [-.5, .8, .6];
  if (direction.length !== 3) fail('Sun direction requires three coordinates');
  const sun = Array.from(direction, v => finite(v, 'sun direction'));
  const length = Math.hypot(...sun);
  if (!length) fail('Sun direction cannot be zero');
  const lighting = Float32Array.of(
    ...rgb(scene.environment?.lower ?? [.10, .17, .25], 'lower environment radiance'),
    ...rgb(scene.environment?.upper ?? [.58, .72, 1.0], 'upper environment radiance'),
    ...sun.map(v => v / length),
    ...rgb(scene.sun?.radiance ?? [1.8, 1.7, 1.5], 'sun radiance'),
  );
  const {sample} = scene;
  const texture = sceneTextureLayout(scene, meshes, geometry);
  const volumeCount = scene.volumes?.length ?? 0;
  const volumeLimits=gpu.capabilities().limits;
  const volumePlan=sceneVolumeLayout(scene.volumes,Math.min(volumeLimits.maxBufferSize,volumeLimits.maxStorageBufferBindingSize));
  const volumeWords=volumePlan.words;
  const emissionOf=(node:SceneNode):SceneRgb|undefined=>{
    const material=scene.materials[node.material!];
    const value=material.kind==='emissive'?material.radiance:material.kind==='pbr'?material.emission:undefined;
    return value?.some(channel=>channel>0)?value:undefined;
  };
  const emitterKeys = new Set(sampleEmitters ? meshes.filter(node => emissionOf(node))
    .map(node => node.geometry!) : []);
  const emissiveShapes = new Map<string, Pick<SceneEmitter, 'positions' | 'indices'>>();
  const dynamicKernel = texture.dynamic.size ? await compileDynamicShading(gpu) : undefined;
  const dynamicIndices = new Map<string,GpuDataBuffer>();
  const {staticMeshes, palette, textureLayout, emptyTexture, volumes, owned} = await withGpuResources(gpu, async arena => {
    const staticMeshes = new Map<string, SceneGpuMesh>();
    const owned: GpuDataBuffer[] = [];
    for (const key of new Set(meshes.map(node => node.geometry!))) {
      const mesh = geometry.get(key)!;
      if ('gpu' in mesh) {
        const producer = mesh.gpu;
        if (typeof producer !== 'function') fail(`GPU geometry ${key} needs a frame producer`);
        geometry.set(key, {gpu: producer, uvTopology: mesh.uvTopology && structuredClone(mesh.uvTopology)});
        if (texture.dynamic.has(key)) {
          const values=Uint32Array.from(mesh.uvTopology!.indices);
          const indices=arena.buffer(await gpu.createBuffer({type:'u32',length:values.length},values));
          dynamicIndices.set(key,indices);owned.push(indices);
        }
        continue;
      }
      const {indices, restPositions} = mesh;
      if (restPositions.length < 3 || indices.length < 3 || indices.length % 3 ||
          indices.some(i => !Number.isSafeInteger(i) || i < 0 || i >= restPositions.length))
        fail(`Invalid indexed triangle mesh ${key}`);
      const vertices = new Float32Array(restPositions.length * 3);
      for (const [index, position] of restPositions.entries()) {
        if (position.length !== 3) fail(`Expected XYZ geometry in ${key}`);
        vertices.set(Array.from(position, v => finite(v, 'vertex position')), index * 3);
      }
      const positions = arena.buffer(await gpu.createField({
        type: 'f32', dimensions: [restPositions.length, 1, 1], components: 3, semantic: 'position', space: 'world', units: 'meter',
      }, vertices));
      const indices32 = Uint32Array.from(indices);
      const index = arena.buffer(await gpu.createBuffer({type: 'u32', length: indices.length}, indices32));
      if (emitterKeys.has(key)) emissiveShapes.set(key, {positions: vertices, indices: indices32});
      owned.push(positions, index);
      staticMeshes.set(key, {positions, indices: index});
    }
    const colors = new Float32Array(meshes.length * 8);
    meshes.forEach((node, index) => colors.set(materials.get(node.material!)!, index * 8));
    const palette = arena.buffer(await gpu.createBuffer({type: 'f32', length: colors.length}, colors));
    const textureLayout = arena.buffer(await gpu.createBuffer({type: 'u32', length: texture.words.length}, texture.words));
    const rawAtlas=scene.textureAtlas?.decode==='rgba32float-le',white=Float32Array.of(1,1,1,1);
    const emptyTexture=arena.buffer(await gpu.createBuffer({type:rawAtlas?'u32':'f32',length:4},
      rawAtlas?new Uint32Array(white.buffer):white));
    const volumes = arena.buffer(await gpu.createBuffer({type: 'f32', length: volumeWords.length}, volumeWords));
    owned.push(palette, textureLayout, emptyTexture, volumes);
    owned.forEach(buffer => arena.keep(buffer));
    return {staticMeshes, palette, textureLayout, emptyTexture, volumes, owned};
  });
  const emitters: SceneEmitter[] = meshes.flatMap((node, instance) => {
    const shape = emissiveShapes.get(node.geometry!),radiance=emissionOf(node);
    return shape && radiance ? [{...shape,node:node.id,instance,radiance}] : [];
  });
  const limits = gpu.capabilities().limits;
  const maxLightBytes = Math.min(limits.maxBufferSize, limits.maxStorageBufferBindingSize);
  let closed = false;
  function sampleWorld(context: FrameContext) {
    if (closed) fail('Scene is disposed');
    const frame = sample(context);
    for (const key of Object.keys(frame.transforms ?? {})) if (!byId.has(key)) fail(`Unknown animated node ${key}`);
    const world = new Map<string, SceneTransform>();
    for (const node of ordered) {
      const local = frame.transforms?.[node.id] === undefined ? node.transform : matrix(frame.transforms[node.id]);
      world.set(node.id, node.parent === undefined ? local : compose(world.get(node.parent)!, local));
    }
    return {world, camera:frame.camera, view:camera(frame.camera, init.width, init.height)};
  }
  async function shapeAt(key:string,context:FrameContext,arena:GpuResourceArena,layout?:GpuDataBuffer) {
    const stored=staticMeshes.get(key);
    if (stored) return stored;
    const source=geometry.get(key)!;
    if (!('gpu' in source)) return fail(`Unprepared geometry ${key}`);
    const shape=await source.gpu(context,arena), plan=texture.dynamic.get(key);
    if (plan) {
      const indices=dynamicIndices.get(key)!;
      if (shape.positions.info.length!==plan.vertices*3 || shape.normals?.info.type!=='f32' ||
          shape.normals.info.length!==shape.positions.info.length)
        return fail(`GPU geometry ${key} requires one deformed F32 XYZ normal per declared vertex`);
      const tangent=texture.dynamicTangents.get(key)??0;
      if(tangent&&(shape.tangents?.info.type!=='f32'||shape.tangents.info.length!==plan.vertices*6))
        fail('Authored deformed tangents need six F32 tangent/bitangent words per vertex');
      if (layout) for(const variant of plan.variants) await gpu.dispatch(dynamicKernel!,[shape.positions,indices,shape.normals,layout,shape.tangents??shape.normals],{
        workItems:[indices.info.length/3,1,1],parameters:Uint32Array.of(variant.shading,variant.tangentUV,tangent),
      });
      return {positions:shape.positions,indices};
    }
    if (source.uvTopology && ((shape.count ?? shape.indices?.info.length) !== source.uvTopology.indices.length ||
        shape.positions.info.length !== (source.uvTopology.vertexCount??source.uvTopology.texCoords?.length??0)*3))
      fail(`GPU geometry ${key} must preserve its declared UV vertex and triangle counts`);
    return shape;
  }
  return {
    palette, lighting, textureLayout, emptyTexture, textureAtlas: texture.atlas, volumes, volumeCount, hasEmitters: emitters.length > 0,
    instanceNames: meshes.map(node=>node.id), materialNames: meshes.map(node=>node.material!),
    environmentRegion:texture.environmentRegion,environmentOffset:texture.environmentOffset,hasCoverage:texture.hasCoverage,
    async motionPose(context:FrameContext,arena:GpuResourceArena) {
      const frame=sampleWorld(context);
      const known=new Map<string,SceneGpuMesh>();
      for(const key of new Set(meshes.map(node=>node.geometry!))) {
        if(staticMeshes.has(key) || dynamicIndices.has(key)) known.set(key,await shapeAt(key,context,arena));
      }
      const objects=meshes.map(node=>{
        const key=node.geometry!, shape=known.get(key);
        return shape?{key,positions:shape.positions,indices:shape.indices!,transform:frame.world.get(node.id)!}:undefined;
      });
      return {view:frame.view,near:frame.camera.near,objects};
    },
    async frame(context: FrameContext, arena: GpuResourceArena) {
      const {world,camera,view}=sampleWorld(context);
      const shadingWords = texture.hasShading ? new Float32Array(meshes.length * 18) : Float32Array.of(0);
      if (texture.hasShading) for (const [index, node] of meshes.entries())
        shadingWords.set(frameShadingMatrix(world.get(node.id)!), index * 18);
      const layout = dynamicKernel ? arena.buffer(await gpu.cloneBuffer(textureLayout)) : textureLayout;
      const shapes = new Map<string,SceneGpuMesh>();
      const geometries: NativeRayGeometry[] = [];
      for (const [id, node] of meshes.entries()) {
        const key = node.geometry!;
        let shape = shapes.get(key);
        if (!shape) {
          shape=await shapeAt(key,context,arena,dynamicKernel?layout:undefined);
          shapes.set(key,shape);
        }
        geometries.push({positions:shape.positions,indices:shape.indices,count:shape.count,id,transform:world.get(node.id)!});
      }
      return {
        view,camera,shadingWords,textureLayout:layout,volumes:await volumePlan.frame(gpu,arena,context,volumes),
        emitterWords: emitters.length ? emitterTable(emitters, meshes.length, world, maxLightBytes) : Uint32Array.of(0),
        scene: await gpu.createRayScene({version: 1, geometries, invalidGeometry: 'discard', quality: 'trace'}),
      };
    },
    async dispose() {
      if (closed) return;
      closed = true;
      for (const buffer of owned) await gpu.releaseBuffer(buffer);
    },
  };
}
