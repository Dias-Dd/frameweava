import type {Signal} from '../../../src/core/types.ts';
import type {Vec3,VectorSignal} from './types.ts';
export interface FaceAerodynamics {
  triangles:[number,number,number][];
  /** Local-time Signals; wind m/s, density kg/m^3, pressure Pa, drag dimensionless. */
  wind?:VectorSignal;density?:Signal<number>;normalDrag?:Signal<number>;tangentialDrag?:Signal<number>;pressure?:Signal<number>;
}
export interface AerodynamicSample {
  model:'quadratic-face-drag';evaluatedAtTime:number;integrated:boolean;
  wind:Vec3;density:number;normalDrag:number;tangentialDrag:number;pressure:number;
  /** Newtons on all vertices, including fixed vertices. Fixed loads are not integrated. */
  forces:Vec3[];totalForce:Vec3;dynamicForce:Vec3;maxAcceleration:number;dissipatedPower:number;
  activeFaces:number;degenerateFaces:number;
}
