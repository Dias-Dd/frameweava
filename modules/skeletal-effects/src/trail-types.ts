import type {Signal} from '../../../src/core/types.ts';
import type {Coordinates3D} from '../../graphics-contracts/types.ts';
import type {FrameContext,MeshData,Vec3} from './types.ts';
import type {MeshDraw} from './mesh-types.ts';

export interface TrailGeometryOptions {
  id:string;
  /** Maximum open stations, or exact distinct station slots for a closed loop. */
  pointCount:number;
  kind?:'tube'|'ribbon';
  radialSegments?:number;
  closed?:boolean;
  caps?:boolean;
  coordinates?:Coordinates3D;
  /** Chunk size cannot exceed existing Graphics v1 per-mesh limits. */
  maxVerticesPerMesh?:number;
  maxBytes?:number;
  maxWork?:number;
}
export interface TrailSampleOptions {
  points:Vec3[];
  /** Tube radius or ribbon half-width, in MeshData meters. */
  radius?:Signal<number>|Signal<number>[];
  /** Right-handed angle about each local tangent, radians. */
  twist?:Signal<number>|Signal<number>[];
  firstNormal?:Vec3;
  context?:FrameContext;
}
export interface TrailFrames {
  tangents:Vec3[];normals:Vec3[];binormals:Vec3[];
  /** Physical accumulated centerline lengths; closed includes the seam endpoint. */
  lengths:number[];
}
export interface TrailSample {
  draws:MeshDraw[];
  frames:TrailFrames;
  active:boolean;
  stations:number;
  totalLength:number;
}
export interface TrailGeometry {
  /** Owned, editable standard MeshData definitions; preserve their declared IDs/topology. */
  meshes:MeshData[];
  sample(options:TrailSampleOptions):TrailSample;
  describe():{kind:'tube'|'ribbon';pointCount:number;closed:boolean;chunks:number;vertices:number;triangles:number;plannedBytes:number;maxBytes:number;maxWork:number};
  dispose():void;
}
