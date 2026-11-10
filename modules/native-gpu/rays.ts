import type {GpuDataBuffer} from '../gpu-effects/compute-types.ts';
export interface NativeRayGeometry {positions:GpuDataBuffer;indices?:GpuDataBuffer;count?:number;transform?:readonly number[];mask?:number;id?:number}
export interface NativeRaySceneOptions {version:1;geometries:readonly NativeRayGeometry[];invalidGeometry:'discard';quality?:'trace'|'build';backend?:'vulkan'|'optix'}
export interface NativeRayScene {readonly info:{version:1;geometries:number;profile:'opaque-triangles-v1';backend?:'vulkan'|'optix'};readonly toJSON:()=>never}
/** Fixed scene material coverage. v1: 14-word records. v2: 16-word records
 * with per-triangle linear RGBA vertex colors at record+14 (zero means white).
 * Both layouts start instance records at word 1; all inputs remain Stage-owned. */
export interface NativeRayCoverage {version:1|2;layout:GpuDataBuffer;texels:GpuDataBuffer;seed?:number}
export interface NativeRayRequest {version:1;origins:GpuDataBuffer;directions:GpuDataBuffer;count?:number;tMin?:number;tMax?:number;mask?:number;signal?:AbortSignal;output?:NativeRayTargets;coverage?:NativeRayCoverage}
/** Four words per ray: hit/instance-id/primitive-id/status; t/u/v/0; nx/ny/nz/front-face. */
export interface NativeRayResult {version:1;count:number;hits:GpuDataBuffer;measurements:GpuDataBuffer;normals:GpuDataBuffer}
/** Optional writable frame-local destinations. A later query can overwrite them. */
export type NativeRayTargets = Pick<NativeRayResult,'hits'|'measurements'|'normals'>;
export interface NativeRayScope {createRayScene(options:NativeRaySceneOptions):Promise<NativeRayScene>;traceRayScene(scene:NativeRayScene,request:NativeRayRequest):Promise<NativeRayResult>;releaseRayScene(scene:NativeRayScene):Promise<void>}
/** Private scene description; buffer indices are resolved by the existing host. */
export interface NativeRayDefinition {version:1;backend?:'vulkan'|'optix';quality:'trace'|'build';invalidGeometry:'discard';transforms:number;geometries:{positions:number;indices?:number;count:number;mask:number;id:number}[]}
