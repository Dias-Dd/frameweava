import type {Signal} from '../../../src/core/types.ts';
import type {Coordinates3D} from '../../graphics-contracts/types.ts';
import type {FrameContext,MeshData,Vec3,VectorSignal} from './types.ts';
import type {MeshDraw} from './mesh-types.ts';

export interface LightningGeometryOptions {
  id:string;
  /** Each bolt has 2**subdivisions segments. Default 5. */
  subdivisions?:number;
  /** Complete, stable branch tree; root is generation 0. Defaults 2 / 2. */
  branchGenerations?:number;
  branchesPerBolt?:number;
  seed?:number;
  /** Multiplier for successive midpoint displacement levels, [0,1]. Default .55. */
  roughness?:number;
  /** Child chord length relative to parent chord. Default .4. */
  branchLength?:number;
  /** Child angle from parent chord, radians, [0,pi]. Default .8. */
  branchAngle?:number;
  /** Child root radius relative to parent radius at attachment. Default .55. */
  branchRadius?:number;
  /** Every bolt's tip/root radius ratio, [0,1]. Default .1. */
  tipScale?:number;
  radialSegments?:number;
  coordinates?:Coordinates3D;
  maxVerticesPerMesh?:number;
  maxBytes?:number;
  maxWork?:number;
}
export interface LightningSampleOptions {
  start:VectorSignal;
  end:VectorSignal;
  context:FrameContext;
  /** Root tube radius, meters. Default .02. Zero explicitly hides all bolts. */
  radius?:Signal<number>;
  /** Largest-level displacement / bolt chord length. Default .12. */
  amplitude?:Signal<number>;
  /** Direct coherent-noise address; defaults to context.time * 3. No integration. */
  phase?:Signal<number>;
}
export interface LightningBolt {
  id:string;
  generation:number;
  parent:number|null;
  /** Exact parent station index, null for the root. */
  attachment:number|null;
  points:Vec3[];
  radii:number[];
}
export interface LightningSample {draws:MeshDraw[];bolts:LightningBolt[];active:boolean;phase:number}
export interface LightningGeometry {
  meshes:MeshData[];
  sample(options:LightningSampleOptions):LightningSample;
  describe():{bolts:number;stationsPerBolt:number;chunks:number;vertices:number;triangles:number;plannedBytes:number;plannedWork:number;maxBytes:number;maxWork:number};
  dispose():void;
}
