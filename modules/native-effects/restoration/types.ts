import type {Signal} from '../../../src/core/types.ts';
import type {ColorEncoding} from '../../../src/media/surface.ts';
import type {GpuPixelImage} from '../../gpu-effects/pixel-types.ts';
import type {GpuDataBuffer} from '../../gpu-effects/compute-types.ts';
export interface RestorationOutput {format?:'rgba16float'|'rgba32float';workingColor?:ColorEncoding;amount?:Signal<number>;signal?:AbortSignal}
export interface WindowOptions extends RestorationOutput {radius?:Signal<number>}
export interface NlmOptions extends WindowOptions {patchRadius?:Signal<number>;strength?:Signal<number>;noiseSigma?:Signal<number>}
export interface GuidedOptions extends WindowOptions {epsilon?:Signal<number>}
export interface AtrousOptions extends RestorationOutput {levels?:number;rangeSigma?:Signal<number>}
export interface DiffusionOptions extends RestorationOutput {iterations?:number;step?:Signal<number>;conductance?:Signal<number>;model?:'exponential'|'reciprocal'}
export interface TvOptions extends RestorationOutput {iterations?:number;regularization?:Signal<number>;step?:Signal<number>}
export interface AnisotropicKuwaharaOptions extends WindowOptions {tensorRadius?:number;anisotropy?:Signal<number>;hardness?:Signal<number>}
export interface SigmaOptions extends WindowOptions {sigma?:Signal<number>;minimumFraction?:Signal<number>}
export interface NoiseVarianceOptions extends WindowOptions {noiseVariance?:Signal<number>}
export interface BilateralOptions extends WindowOptions {spatialSigma?:Signal<number>;rangeSigma?:Signal<number>}
export interface RollingOptions extends BilateralOptions {iterations?:number;initialSigma?:Signal<number>}
export interface ImpulseOptions extends WindowOptions {sigma?:Signal<number>;noiseFloor?:Signal<number>}
export interface BokehOptions extends RestorationOutput {radius?:Signal<number>;blades?:number;rotation?:Signal<number>;roundness?:Signal<number>}
export interface TiltShiftOptions extends BokehOptions {center?:readonly [Signal<number>,Signal<number>];angle?:Signal<number>;inFocusWidth?:Signal<number>;transition?:Signal<number>;samples?:number}
/** Stage-local metadata wrapper, never a persistent Graphics/TVG port. Depth
 * buffer: single f32 z in metres, 0 missing, camera space; range declares admitted data. */
export interface NativeDepthField {readonly kind:'native-depth';readonly version:1;readonly width:number;readonly height:number;readonly rangeM:readonly [number,number];readonly buffer:GpuDataBuffer}
export interface NativeCocField {readonly kind:'native-circle-of-confusion';readonly version:1;readonly width:number;readonly height:number;readonly maxRadius:number;readonly units:'pixels';readonly buffer:GpuDataBuffer}
export interface CocOptions {focalLengthMm?:Signal<number>;fStop?:Signal<number>;focusDistanceM?:Signal<number>;sensorWidthMm?:Signal<number>;signal?:AbortSignal}
export interface LensOptions extends RestorationOutput,CocOptions {blades?:number;rotation?:Signal<number>;roundness?:Signal<number>}
export interface SplitDiopterOptions extends LensOptions {secondFocusDistanceM?:Signal<number>;split?:Signal<number>;transition?:Signal<number>;angle?:Signal<number>}
export interface PeakingOptions extends RestorationOutput {threshold?:Signal<number>;softness?:Signal<number>;color?:readonly [Signal<number>,Signal<number>,Signal<number>]}
export interface NativeRestorationFilters {
 nonLocalMeans(image:GpuPixelImage,options?:NlmOptions):Promise<GpuPixelImage>;
 guidedDenoise(image:GpuPixelImage,options?:GuidedOptions):Promise<GpuPixelImage>;
 atrousDenoise(image:GpuPixelImage,options?:AtrousOptions):Promise<GpuPixelImage>;
 anisotropicDiffusion(image:GpuPixelImage,options?:DiffusionOptions):Promise<GpuPixelImage>;
 totalVariationDenoise(image:GpuPixelImage,options?:TvOptions):Promise<GpuPixelImage>;
 kuwahara(image:GpuPixelImage,options?:WindowOptions):Promise<GpuPixelImage>;
 anisotropicKuwahara(image:GpuPixelImage,options?:AnisotropicKuwaharaOptions):Promise<GpuPixelImage>;
 sigmaDenoise(image:GpuPixelImage,options?:SigmaOptions):Promise<GpuPixelImage>;
 wienerDenoise(image:GpuPixelImage,options?:NoiseVarianceOptions):Promise<GpuPixelImage>;
 leeDenoise(image:GpuPixelImage,options?:NoiseVarianceOptions):Promise<GpuPixelImage>;
 jointBilateral(image:GpuPixelImage,guide:GpuPixelImage,options?:BilateralOptions):Promise<GpuPixelImage>;
 rollingGuidance(image:GpuPixelImage,options?:RollingOptions):Promise<GpuPixelImage>;
 chromaDenoise(image:GpuPixelImage,options?:BilateralOptions):Promise<GpuPixelImage>;
 impulseDenoise(image:GpuPixelImage,options?:ImpulseOptions):Promise<GpuPixelImage>;
 bokehBlur(image:GpuPixelImage,options?:BokehOptions):Promise<GpuPixelImage>;
 depthOfField(image:GpuPixelImage,depth:NativeDepthField,options?:LensOptions):Promise<GpuPixelImage>;
 tiltShift(image:GpuPixelImage,options?:TiltShiftOptions):Promise<GpuPixelImage>;
 splitDiopter(image:GpuPixelImage,depth:NativeDepthField,options?:SplitDiopterOptions):Promise<GpuPixelImage>;
 depthBilateral(image:GpuPixelImage,depth:NativeDepthField,options?:BilateralOptions):Promise<GpuPixelImage>;
 focusPeaking(image:GpuPixelImage,options?:PeakingOptions):Promise<GpuPixelImage>;
 circleOfConfusion(depth:NativeDepthField,options?:CocOptions):Promise<NativeCocField>;
}
export const nativeRestorationNames=['nonLocalMeans','guidedDenoise','atrousDenoise','anisotropicDiffusion','totalVariationDenoise','kuwahara','anisotropicKuwahara','sigmaDenoise','wienerDenoise','leeDenoise','jointBilateral','rollingGuidance','chromaDenoise','impulseDenoise','bokehBlur','depthOfField','tiltShift','splitDiopter','depthBilateral','focusPeaking','circleOfConfusion'] as const satisfies readonly (keyof NativeRestorationFilters)[];
