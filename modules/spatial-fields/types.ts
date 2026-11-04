import type {FrameContext,Signal} from '../../src/core/types.ts';
import type {GpuDataBuffer} from '../gpu-effects/index.ts';
import type {SpatialCamera,SpatialFrame,SpatialTime} from '../spatial-data-effects/src/types.ts';
export type {FrameContext,SpatialCamera,SpatialFrame,SpatialTime};
export type Vec3=readonly [number,number,number];
/** Ordinary module-local pair of existing opaque GPU capabilities, never a Stage port. */
export interface SpatialField {readonly data:GpuDataBuffer;readonly validity:GpuDataBuffer}
export type FieldKind='device-depth'|'axial-depth'|'ray-distance'|'world-position'|'world-normal'|'view-normal'|'pixel-motion'|'projected-position'|'visibility'|'scalar'|'gradient'|'direction'|'depth-bounds';
export interface FieldOptions {signal?:AbortSignal;maxWork?:number}
export interface CameraOptions extends FieldOptions {camera:SpatialCamera}
export interface DepthOptions extends CameraOptions {/** Explicit inverse conversion, not a second time system. */inverse?:boolean}
export interface NormalOptions extends CameraOptions {space?:'world'|'view';/** Absolute axial discontinuity guard in meters. */maxDepthJump?:number}
export interface ReferenceOptions extends CameraOptions {reference:{camera:SpatialCamera;context:SpatialTime}}
export interface VisibilityOptions extends FieldOptions {absoluteTolerance?:Signal<number>;relativeTolerance?:Signal<number>}
export interface PointDistanceOptions extends FieldOptions {point?:Vec3}
export interface PlaneDistanceOptions extends FieldOptions {normal?:Vec3;offset?:Signal<number>;absolute?:boolean}
export interface DerivativeOptions extends FieldOptions {/** Largest adjacent world-space step admitted, meters. */maxStep?:number}
export interface RefractionOptions extends CameraOptions {outsideIndex?:number;insideIndex?:number}
export interface CapturedFields {depth:SpatialField;normal:SpatialField;motion:SpatialField;transfer:{path:'webgl-cpu-webgpu';zeroCopy:false;uploadBytes:number}}

/** Positive axial meters. Feather width is inside each edge, at most half the interval. */
export interface DepthMatteOptions extends CameraOptions {near?:Signal<number>;far?:Signal<number>;softness?:Signal<number>;format?:'rgba16float'|'rgba32float'}
