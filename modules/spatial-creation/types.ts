import type {CreationColor} from './colors.ts';
export type {CreationColor,StaticCreationColor} from './colors.ts';
import type {FrameContext,Signal} from '../../src/core/types.ts';
import type {NativeStageInit,NativeStageInstance} from '../native-gpu/authoring.ts';
import type {GpuPixelImage} from '../gpu-effects/pixel-types.ts';
import type {ModuleLoader} from '../../src/plugins/sdk.ts';
import type {SpatialCamera} from '../spatial-fields/types.ts';

/** Core scalar interpolation on each component; vector keyframes are NOT reinterpreted. */
export type AnimatedVec3=readonly [Signal<number>,Signal<number>,Signal<number>];
export type AnimatedRGBA=readonly [Signal<number>,Signal<number>,Signal<number>,Signal<number>];
export type CreationInputs=Readonly<Record<string,GpuPixelImage>>;
export type CreationStage=Omit<NativeStageInstance<CreationInputs>,'renderAt'>&{
 renderAt(context:FrameContext,inputs:CreationInputs,props:Record<string,unknown>):Promise<GpuPixelImage>;
 inspect():Readonly<Record<string,unknown>>;
};
export type CreationInit=Pick<NativeStageInit,'gpu'|'width'|'height'|'seed'>;
/** Existing declared Native image resource. No implicit file/URL access. */
export interface CreationImageResource {resource:string;size:readonly [number,number];decode?:'icc-sdr'|'surface-v2';missingProfile?:'error'|'assume-srgb'}
/** Existing verified R1 loaders. No filesystem, network or WASM permission is granted here. */
export interface CreationServices {puppet?:ModuleLoader;rigid?:ModuleLoader;deform?:ModuleLoader;contacts?:ModuleLoader;coupled?:ModuleLoader}
export interface CreationPost {
  /** owned: fresh caller-owned result; retained: provider may invalidate it on its next call. */
  readonly ownership:'owned'|'retained';
  readonly apply:(input:GpuPixelImage,context:FrameContext)=>GpuPixelImage|Promise<GpuPixelImage>;
}
export interface CreationOptions {
  format?:'rgba16float'|'rgba32float';
  /** Ready-to-use looks or ordinary typed controls; resources are automatic. */
  finish?:import('./finish.ts').CreationFinish;
  /** Explicit Stage-local transforms, executed in authored order. */
  post?:readonly CreationPost[];
  signal?:AbortSignal;
}
export interface CameraOptions {camera?:SpatialCamera}
export interface MaterialOptions {
  ink?:CreationColor;opacity?:Signal<number>;emissive?:CreationColor;
  roughness?:Signal<number>;metalness?:Signal<number>;
}
