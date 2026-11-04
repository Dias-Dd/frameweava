import type {GpuDataBuffer} from '../gpu-effects/compute-types.ts';
export interface NativeRayGeometry {positions:GpuDataBuffer;indices?:GpuDataBuffer;count?:number;transform?:readonly number[];mask?:number;id?:number}
export interface NativeRaySceneOptions {version:1;geometries:readonly NativeRayGeometry[];invalidGeometry:'discard';quality?:'trace'|'build';backend?:'vulkan'|'optix'}
export interface NativeRayScene {readonly info:{version:1;geometries:number;profile:'opaque-triangles-v1';backend?:'vulkan'|'optix'};readonly toJSON:()=>never}
export interface NativeRayRequest {version:1;origins:GpuDataBuffer;directions:GpuDataBuffer;count?:number;tMin?:number;tMax?:number;mask?:number;signal?:AbortSignal}
/** Four words per ray: hit/instance-id/primitive-id/status; t/u/v/0; nx/ny/nz/front-face. */
export interface NativeRayResult {version:1;count:number;hits:GpuDataBuffer;measurements:GpuDataBuffer;normals:GpuDataBuffer}
export interface NativeRayScope {createRayScene(options:NativeRaySceneOptions):Promise<NativeRayScene>;traceRayScene(scene:NativeRayScene,request:NativeRayRequest):Promise<NativeRayResult>;releaseRayScene(scene:NativeRayScene):Promise<void>}
/** Private scene description; buffer indices are resolved by the existing host. */
export interface NativeRayDefinition {version:1;backend?:'vulkan'|'optix';quality:'trace'|'build';invalidGeometry:'discard';transforms:number;geometries:{positions:number;indices?:number;count:number;mask:number;id:number}[]}
