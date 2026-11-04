import type {FrameContext,Signal} from '../../src/core/types.ts';
export type {FrameContext};
export type Vec3=readonly [number,number,number];
export type AnimatedVec3=readonly [Signal<number>,Signal<number>,Signal<number>];
export type Axis='x'|'y'|'z';
/** Full resident f32 XYZ position fields, explicit space + meter units. Inputs borrowed. */
export interface DeformOptions {
 signal?:AbortSignal;
 /** Configurable work budget; never reduces geometry or precision. Default 1e9. */
 maxWork?:number;
 /** Qualified absolute input coordinate magnitude. Default 1e4 meters, maximum 1e8.
  * Invalid GPU data is poisoned; readDeformedPositions diagnoses at publication. */
 maxCoordinate?:number;
 center?:Vec3;
}
export interface AxisOptions extends DeformOptions {axis?:Axis}
export interface TransformOptions extends DeformOptions {translation?:AnimatedVec3;rotation?:AnimatedVec3;scale?:AnimatedVec3}
export interface TwistOptions extends AxisOptions {rate?:Signal<number>;offset?:Signal<number>}
export interface BendOptions extends AxisOptions {/** Perpendicular bend direction; default cyclic next axis. */toward?:Axis;curvature?:Signal<number>}
export interface TaperOptions extends AxisOptions {slope?:Signal<number>}
export interface ShearOptions extends AxisOptions {toward?:Axis;amount?:Signal<number>}
export interface StretchOptions extends AxisOptions {factor?:Signal<number>;preserveVolume?:boolean}
export interface BulgeOptions extends AxisOptions {amplitude?:Signal<number>;length?:number}
export interface SpherifyOptions extends DeformOptions {radius?:Signal<number>;amount?:Signal<number>}
export interface CylindrifyOptions extends AxisOptions {radius?:Signal<number>;amount?:Signal<number>}
export interface WaveOptions extends DeformOptions {direction?:Vec3;displacement?:Vec3;amplitude?:Signal<number>;frequency?:Signal<number>;phase?:Signal<number>}
export interface RippleOptions extends AxisOptions {amplitude?:Signal<number>;frequency?:Signal<number>;phase?:Signal<number>;decay?:number}
export interface NoiseOptions extends DeformOptions {amplitude?:Signal<number>;frequency?:number;offset?:Vec3;seed?:number}
export interface MorphOptions extends DeformOptions {amount?:Signal<number>}
export interface CageOptions extends DeformOptions {min?:Vec3;max?:Vec3;/** Corner order x + 2*y + 4*z; points in the same space, not displacements. */corners:readonly Vec3[];outside?:'extend'|'preserve'}
export interface AttractOptions extends DeformOptions {target?:AnimatedVec3;radius?:number;strength?:Signal<number>}
