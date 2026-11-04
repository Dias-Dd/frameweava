import type {Signal} from '../../../src/core/types.ts';
import type {ColorEncoding} from '../../../src/media/surface.ts';
import type {GpuPixelImage} from '../../gpu-effects/pixel-types.ts';
export type Point=readonly [Signal<number>,Signal<number>];
export type Triple=readonly [Signal<number>,Signal<number>,Signal<number>];
export interface OpticalOutput {format?:'rgba16float'|'rgba32float';workingColor?:ColorEncoding;amount?:Signal<number>;signal?:AbortSignal}
export interface HighlightOptions extends OpticalOutput {threshold?:Signal<number>;knee?:Signal<number>;intensity?:Signal<number>}
export interface BloomOptions extends HighlightOptions {levels?:number;radius?:Signal<number>;scatter?:Signal<number>}
export interface AnamorphicOptions extends HighlightOptions {radius?:Signal<number>;squeeze?:Signal<number>}
export interface StreakOptions extends HighlightOptions {length?:Signal<number>;angle?:Signal<number>;decay?:Signal<number>;samples?:number}
export interface GlareOptions extends StreakOptions {arms?:number;rotation?:Signal<number>}
export interface GhostOptions extends HighlightOptions {center?:Point;count?:number;spacing?:Signal<number>;falloff?:Signal<number>;dispersion?:Signal<number>}
export interface HaloOptions extends HighlightOptions {center?:Point;radius?:Signal<number>;width?:Signal<number>;dispersion?:Signal<number>}
export interface DirtOptions extends HighlightOptions {radius?:Signal<number>;dirtGain?:Signal<number>}
export interface FlareOptions extends HighlightOptions {center?:Point;ghosts?:number;spacing?:Signal<number>;haloRadius?:Signal<number>;haloWidth?:Signal<number>;streakLength?:Signal<number>;dispersion?:Signal<number>}
export interface RayOptions extends HighlightOptions {center?:Point;samples?:number;density?:Signal<number>;decay?:Signal<number>}
export interface OccludedRayOptions extends RayOptions {opticalDensity?:Signal<number>}
export interface ChromaticOptions extends OpticalOutput {center?:Point;scales?:Triple;offset?:Point}
export interface AxialOptions extends OpticalOutput {radii?:Triple}
export interface SpectralOptions extends OpticalOutput {center?:Point;dispersion?:Signal<number>;samples?:number}
export interface HalationOptions extends HighlightOptions {radius?:Signal<number>;spread?:Signal<number>;red?:Signal<number>;green?:Signal<number>}
export interface SoftFocusOptions extends OpticalOutput {radius?:Signal<number>;strength?:Signal<number>;highlightBias?:Signal<number>}
export interface DiffusionOptions extends OpticalOutput {radius?:Signal<number>;spread?:Signal<number>;strength?:Signal<number>;haloFraction?:Signal<number>}
export interface AiryOptions extends OpticalOutput {radius?:Signal<number>;firstZero?:Signal<number>}
export interface LeakOptions extends OpticalOutput {center?:Point;width?:Signal<number>;angle?:Signal<number>;intensity?:Signal<number>;color?:Triple;ripple?:Signal<number>}
export interface VignetteOptions extends OpticalOutput {center?:Point;focalLengthMm?:Signal<number>;sensorWidthMm?:Signal<number>;squeeze?:Signal<number>}
export interface VeilOptions extends OpticalOutput {strength?:Signal<number>}
export interface NativeOpticalFilters {
 bloomPyramid(image:GpuPixelImage,options?:BloomOptions):Promise<GpuPixelImage>;
 anamorphicBloom(image:GpuPixelImage,options?:AnamorphicOptions):Promise<GpuPixelImage>;
 streakGlare(image:GpuPixelImage,options?:StreakOptions):Promise<GpuPixelImage>;
 diffractionGlare(image:GpuPixelImage,options?:GlareOptions):Promise<GpuPixelImage>;
 lensGhosts(image:GpuPixelImage,options?:GhostOptions):Promise<GpuPixelImage>;
 lensHalo(image:GpuPixelImage,options?:HaloOptions):Promise<GpuPixelImage>;
 lensDirt(image:GpuPixelImage,dirt:GpuPixelImage,options?:DirtOptions):Promise<GpuPixelImage>;
 lensFlare(image:GpuPixelImage,options?:FlareOptions):Promise<GpuPixelImage>;
 lightRays(image:GpuPixelImage,options?:RayOptions):Promise<GpuPixelImage>;
 occludedLightRays(image:GpuPixelImage,occlusion:GpuPixelImage,options?:OccludedRayOptions):Promise<GpuPixelImage>;
 chromaticAberration(image:GpuPixelImage,options?:ChromaticOptions):Promise<GpuPixelImage>;
 axialChromaticAberration(image:GpuPixelImage,options?:AxialOptions):Promise<GpuPixelImage>;
 spectralDispersion(image:GpuPixelImage,options?:SpectralOptions):Promise<GpuPixelImage>;
 halation(image:GpuPixelImage,options?:HalationOptions):Promise<GpuPixelImage>;
 softFocus(image:GpuPixelImage,options?:SoftFocusOptions):Promise<GpuPixelImage>;
 diffusionFilter(image:GpuPixelImage,options?:DiffusionOptions):Promise<GpuPixelImage>;
 airyDiffraction(image:GpuPixelImage,options?:AiryOptions):Promise<GpuPixelImage>;
 lightLeak(image:GpuPixelImage,options?:LeakOptions):Promise<GpuPixelImage>;
 opticalVignette(image:GpuPixelImage,options?:VignetteOptions):Promise<GpuPixelImage>;
 veilingGlare(image:GpuPixelImage,options?:VeilOptions):Promise<GpuPixelImage>;
}
export const nativeOpticalNames=['bloomPyramid','anamorphicBloom','streakGlare','diffractionGlare','lensGhosts','lensHalo','lensDirt','lensFlare','lightRays','occludedLightRays','chromaticAberration','axialChromaticAberration','spectralDispersion','halation','softFocus','diffusionFilter','airyDiffraction','lightLeak','opticalVignette','veilingGlare'] as const satisfies readonly (keyof NativeOpticalFilters)[];
