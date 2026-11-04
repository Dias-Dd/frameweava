// SPDX-License-Identifier: Apache-2.0
import type {FrameContext,Signal} from '../../../../src/core/types.ts';
import type {GpuPixelImage} from '../../../gpu-effects/pixel-types.ts';
import type {NativeGpuScope} from '../../../native-gpu/authoring.ts';
import type {CardMeshControls} from './card-types.ts';
export type * from './card-types.ts';

/** Optional shared-library dependency; never creates or replaces a GPU owner. */
export type NativeMaskBlur=((image:GpuPixelImage,options:{radius:number;boundary:'clamp';format:'rgba32float';signal?:AbortSignal})=>Promise<GpuPixelImage>)&{/** Declared qualified provider domain; omitted preserves the PA sigma-64 contract. */readonly maxSigma?:number};
export interface NativeTransitionEnvironment {gpu:NativeGpuScope;width?:number;height?:number;/** Reviewed precision-qualified shared Gaussian. Required for new blurred-mask profiles. */blurMask?:NativeMaskBlur}
export type NativeTransitionScope=NativeGpuScope|NativeTransitionEnvironment;

export interface TransitionOptions {
 /** Existing Signal, evaluated once. Defaults to context.progress; never wall time. Range [0,1]. */
 progress?:Signal<number>;
 format?:'rgba16float'|'rgba32float';
 signal?:AbortSignal;
}
export interface SoftTransitionOptions extends TransitionOptions {softness?:Signal<number>}
export interface CenterTransitionOptions extends SoftTransitionOptions {center?:readonly [Signal<number>,Signal<number>]}
export interface ColorTransitionOptions extends TransitionOptions {
 /** Straight scene-linear RGBA in the input encoding; signed/HDR RGB allowed. */
 color?:readonly [Signal<number>,Signal<number>,Signal<number>,Signal<number>];
}
export interface EdgeSamplingOptions {/** Fixed spatial samples per pixel axis; no history or temporal sampling. */edgeSamples?:number}
export interface DirectionalWipeOptions extends SoftTransitionOptions,EdgeSamplingOptions {direction?:readonly [number,number];angleDegrees?:Signal<number>;featherPixels?:Signal<number>}
export interface ClockWipeOptions extends CenterTransitionOptions,EdgeSamplingOptions {startAngleDegrees?:Signal<number>;wipe?:'clockwise'|'counterclockwise'|'both';angularFeatherDegrees?:Signal<number>}
export interface IrisWipeOptions extends CenterTransitionOptions,EdgeSamplingOptions {
 /** Explicit radii use image pixels and replace progress; otherwise legacy circular progress remains available. */
 outerRadius?:Signal<number>;innerRadius?:Signal<number>;points?:number;rotationDegrees?:Signal<number>;featherPixels?:Signal<number>;
}
export interface GridTransitionOptions extends SoftTransitionOptions {cells?:readonly [number,number]}
export interface RandomBlocksOptions extends GridTransitionOptions,EdgeSamplingOptions {seed?:number;blockSize?:readonly [Signal<number>,Signal<number>];softEdges?:boolean;featherPixels?:Signal<number>}
export interface VenetianWipeOptions extends SoftTransitionOptions,EdgeSamplingOptions {count?:number;axis?:'x'|'y';angleDegrees?:Signal<number>;width?:Signal<number>;featherPixels?:Signal<number>}
export interface MaskWipeOptions extends SoftTransitionOptions {
 /** Explicit scalar mask domain; values beyond this interval saturate the MASK, never RGB. */
 range?:readonly [number,number];
 placement?:'stretch'|'center'|'tile';invert?:boolean;
}
export interface MoveTransitionOptions extends TransitionOptions {direction?:'left'|'right'|'up'|'down'}
export interface SplitTransitionOptions extends TransitionOptions {axis?:'x'|'y'}
export interface ZoomTransitionOptions extends TransitionOptions {strength?:Signal<number>;boundary?:'clamp'|'transparent'}
export interface RotateTransitionOptions extends TransitionOptions {turns?:Signal<number>;boundary?:'clamp'|'transparent'}
export interface RippleTransitionOptions extends TransitionOptions {
 /** Pixel displacement; frequency is cycles per image-height radius, speed is cycles per transition. */
 amplitude?:Signal<number>;frequency?:Signal<number>;speed?:Signal<number>;boundary?:'clamp'|'transparent';
}
export interface DisplacementTransitionOptions extends TransitionOptions {
 /** Pixel displacement. Mask straight R/G use explicit range (default [0,1]) mapped to [-1,1]. */
 strength?:Signal<number>;range?:readonly [number,number];boundary?:'clamp'|'transparent';
}
export interface StarWipeOptions extends CenterTransitionOptions {points?:number;innerRatio?:Signal<number>}
export interface CardFlipOptions extends TransitionOptions,CardMeshControls {
 cells?:readonly [number,number];axis?:'x'|'y'|'random';stagger?:Signal<number>;shading?:Signal<number>|boolean;
 transitionWidth?:Signal<number>;cardScale?:Signal<number>;columnsFollowRows?:boolean;
 order?:'left-right'|'right-left'|'top-bottom'|'bottom-top'|'top-left'|'top-right'|'bottom-left'|'bottom-right'|'gradient';
 gradient?:GpuPixelImage;timingRandomness?:Signal<number>;seed?:number;
}
export interface GlassWipeOptions extends MaskWipeOptions {displacement?:Signal<number>;mapBlur?:Signal<number>;boundary?:'clamp'|'transparent'}
export interface GridWipeOptions extends CenterTransitionOptions {cells?:readonly [number,number];rotationDegrees?:Signal<number>;shape?:'doors'|'radial'|'rectangle';reverse?:boolean;tiles?:Signal<number>;borderPixels?:Signal<number>}
export interface ImageWipeOptions extends MaskWipeOptions {channel?:'red'|'green'|'blue'|'alpha'|'luma'|'lightness'|'hue'|'saturation';invert?:boolean;blur?:Signal<number>;borderSoftness?:Signal<number>;autoSoftness?:boolean;temporalSamples?:number;/** With Auto Softness, produces a fresh same-owner gradient at each local shutter time. Ownership transfers to this call; never retain across frames. */gradientAt?:(context:FrameContext)=>GpuPixelImage|Promise<GpuPixelImage>}
export interface JawsWipeOptions extends TransitionOptions {center?:readonly [Signal<number>,Signal<number>];teeth?:number;amplitude?:Signal<number>;rotationDegrees?:Signal<number>;shape?:'triangle'|'rounded'|'square'|'sine';toothWidth?:Signal<number>;heightPercent?:Signal<number>}
export interface LightWipeOptions extends ColorTransitionOptions {softness?:Signal<number>;direction?:readonly [number,number];intensity?:Signal<number>;center?:readonly [Signal<number>,Signal<number>];shape?:'doors'|'round'|'square';rotationDegrees?:Signal<number>;reverse?:boolean;colorFromSource?:boolean}
export interface LineSweepOptions extends SoftTransitionOptions {strips?:number;slant?:Signal<number>;flip?:boolean;rotationDegrees?:Signal<number>;thickness?:Signal<number>;slantPixels?:Signal<number>;/** 0: sequential, 1: all lines start together. Replaces slant/slantPixels. */overlap?:Signal<number>}
export interface RadialScaleWipeOptions extends TransitionOptions {center?:readonly [Signal<number>,Signal<number>];reverse?:boolean}
export interface ScaleWipeOptions extends DirectionalWipeOptions {stretch?:Signal<number>;center?:readonly [Signal<number>,Signal<number>];stretchOnly?:boolean}
export interface TwisterOptions extends TransitionOptions {center?:readonly [Signal<number>,Signal<number>];rotationDegrees?:Signal<number>;shading?:Signal<number>|boolean}
export interface WarpTransitionOptions extends MaskWipeOptions {amount?:Signal<number>;direction?:'same'|'opposite'|'perpendicular';reactor?:'brightness'|'contrast'|'local'|'brightness-difference'|'contrast-difference'|'local-difference';reactorSource?:'mask'|'sources';blendSpan?:Signal<number>;smoothness?:Signal<number>;boundary?:'clamp'|'transparent'}
export type TransitionFunction<O extends TransitionOptions=TransitionOptions>=(gpu:NativeTransitionScope,from:GpuPixelImage,to:GpuPixelImage,options?:O,context?:FrameContext)=>Promise<GpuPixelImage>;
export type MaskTransitionFunction<O extends TransitionOptions=MaskWipeOptions>=(gpu:NativeTransitionScope,from:GpuPixelImage,to:GpuPixelImage,mask:GpuPixelImage,options?:O,context?:FrameContext)=>Promise<GpuPixelImage>;
export interface BoundWarpTransition {
 (from:GpuPixelImage,to:GpuPixelImage,options?:WarpTransitionOptions,context?:FrameContext):Promise<GpuPixelImage>;
 (from:GpuPixelImage,to:GpuPixelImage,mask:GpuPixelImage,options?:WarpTransitionOptions,context?:FrameContext):Promise<GpuPixelImage>;
}
