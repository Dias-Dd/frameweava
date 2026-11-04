import type {FrameContext,MeshData,Vec3} from './types.ts';import type {Signal} from '../../../src/core/types.ts';
export interface SurfaceSamplerBudgets {maxSamples?:number;maxWork?:number;maxBytes?:number}
export interface SurfaceSampleOptions {seed?:number;offset?:number;positions?:Vec3[];vertexDensity?:Signal<number>[];context?:FrameContext}
/** Owned Stage-local numeric values. Not an image/AOV/Graphics port or a permission token. */
export interface SurfaceSamples {meshId:string;sourceHash:string;count:number;offset:number;seed:number;triangleIndices:Uint32Array;barycentric:Float64Array;positions:Float64Array;normals:Float64Array;uv?:Float64Array;distribution:'uniform-area'|'linear-vertex-density'}
export type SurfaceBinding=Pick<SurfaceSamples,'meshId'|'sourceHash'|'count'|'triangleIndices'|'barycentric'>;
export interface SurfaceSampler {
  sample(count:number,options?:SurfaceSampleOptions):SurfaceSamples;
  /** Re-evaluate material-point bindings at new positions without resampling their triangles. */
  project(binding:SurfaceBinding,positions?:Vec3[]):Pick<SurfaceSamples,'positions'|'normals'|'uv'>;
  describe():{meshId:string;sourceHash:string;triangles:number;zeroAreaTriangles:number;totalArea:number;areaCdf:Float64Array;budgets:Required<SurfaceSamplerBudgets>;disposed:boolean};
  dispose():void;
}
export type {MeshData};
