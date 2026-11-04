import type {FrameContext,Signal} from '../../src/core/types.ts';
import type {GpuDataBuffer,GpuPixelScope,GpuPixelImage,GpuSize3} from '../gpu-effects/index.ts';
export type {FrameContext,GpuDataBuffer,GpuPixelScope,GpuPixelImage};
export type Vec3=readonly [number,number,number];
/** Cell centers in a full, resident, axis-aligned world grid. No color/Alpha. */
export interface GridOptions {dimensions?:GpuSize3;origin?:Vec3;spacing?:Vec3}
export interface ComputeOptions {signal?:AbortSignal;maxWork?:number}
export interface StepOptions extends ComputeOptions {dt?:Signal<number>}
export interface CellularOptions extends GridOptions,ComputeOptions {frequency?:number;sharpness?:number;strength?:Signal<number>;seed?:number}
export interface VortexOptions extends GridOptions,ComputeOptions {center?:Vec3;radius?:number;strength?:Signal<number>;lift?:Signal<number>}
export interface CurlOptions extends GridOptions,ComputeOptions {frequency?:number;amplitude?:Signal<number>;epsilon?:number;seed?:number}
export interface AdvectOptions extends StepOptions {boundary?:'clamp'|'zero'}
export interface DiffuseOptions extends StepOptions {coefficient?:number;iterations?:number}
export interface ProjectOptions extends ComputeOptions {iterations?:number}
export interface ConfinementOptions extends StepOptions {strength?:Signal<number>}
export interface ReactionOptions extends StepOptions {diffusionU?:number;diffusionV?:number;feed?:Signal<number>;kill?:Signal<number>;rate?:number}
export interface WaveOptions extends StepOptions {speed?:number;damping?:number}
export interface ErosionOptions extends StepOptions {talusSlope?:number;rate?:number}
export interface DistanceOptions extends ComputeOptions {threshold?:number;refine?:number}
export interface ParticleAdvectOptions extends AdvectOptions {}
export interface FlockOptions extends StepOptions {radius?:number;separation?:number;alignment?:number;cohesion?:number;maxSpeed?:number;maxAcceleration?:number;bounds?:readonly [Vec3,Vec3]}
export interface SplatOptions extends GridOptions,ComputeOptions {/** Extinction area per particle (m^2); CIC output is inverse meters. */area?:number}
export interface VolumeOptions extends ComputeOptions {width?:number;height?:number;format?:'rgba16float'|'rgba32float';steps?:number;color?:readonly [Signal<number>,Signal<number>,Signal<number>];exposure?:Signal<number>;position?:Vec3;target?:Vec3;up?:Vec3;verticalFov?:number;near?:number;far?:number}
export interface ParticleState {positions:GpuDataBuffer;velocities:GpuDataBuffer}
