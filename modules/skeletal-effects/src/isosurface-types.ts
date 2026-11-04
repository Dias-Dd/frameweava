import type {Signal} from '../../../src/core/types.ts';
import type {Coordinates3D} from '../../graphics-contracts/types.ts';
import type {FrameContext,MeshData,Vec3,VectorSignal} from './types.ts';
import type {MeshDraw} from './mesh-types.ts';
export interface IsosurfaceGeometryOptions {
  id:string;
  /** Positive cell counts, not sample counts. Samples are (x+1)*(y+1)*(z+1). */
  cells?:[number,number,number];
  bounds?:{min:Vec3;max:Vec3};
  /** Scalar membership; default above. Native table winding points toward low values. */
  inside?:'above'|'below';
  /** Explicit reusable triangle slots; overflow rejects, never truncates. Default10000. */
  triangleCapacity?:number;
  coordinates?:Coordinates3D;
  maxVerticesPerMesh?:number;
  maxBytes?:number;
  maxWork?:number;
}
export interface IsosurfaceSampleOptions {
  /** X fastest, then Y, then Z. Stage-local data; SharedArrayBuffer not accepted. */
  values:number[]|Float32Array|Float64Array;
  level?:Signal<number>;
  context?:FrameContext;
}
export interface Metaball {center:VectorSignal;radius:Signal<number>;strength?:Signal<number>}
export interface MetaballSampleOptions {balls:Metaball[];context:FrameContext;level?:Signal<number>}
export interface IsosurfaceSample {
  draws:MeshDraw[];
  triangleCount:number;
  active:boolean;
  level:number;
  /** Interpolated zero scalar gradients use a geometric triangle normal. */
  gradientFallbacks:number;
}
export interface IsosurfaceGeometry {
  meshes:MeshData[];
  sample(options:IsosurfaceSampleOptions):IsosurfaceSample;
  /** Compact density sum strength*max(1-(distance/radius)^2,0)^3; default level .125. */
  sampleMetaballs(options:MetaballSampleOptions):IsosurfaceSample;
  describe():{cells:[number,number,number];samples:number;triangleCapacity:number;chunks:number;vertices:number;plannedBytes:number;plannedWork:number;maxBytes:number;maxWork:number;inside:'above'|'below'};
  dispose():void;
}
