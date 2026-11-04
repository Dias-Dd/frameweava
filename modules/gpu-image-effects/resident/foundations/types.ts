import type {Signal} from '../../../../src/core/types.ts';
import type {GpuPixelImage} from '../../../gpu-effects/pixel-types.ts';
import type {OutputOptions,Triple} from '../parameters.ts';
import type {UtilityFilters} from './utility-types.ts';
import type {SpatialFilters} from './spatial-types.ts';
import type {StatisticsFilters} from './statistics.ts';
export type PairSignal=readonly [Signal<number>,Signal<number>];
export type Kernel3=readonly [Signal<number>,Signal<number>,Signal<number>,Signal<number>,Signal<number>,Signal<number>,Signal<number>,Signal<number>,Signal<number>];
export interface BoundaryOptions extends OutputOptions {boundary?:'clamp'|'transparent'}
export interface BoxBlurOptions extends BoundaryOptions {radius?:Signal<number>;iterations?:number;axis?:'both'|'horizontal'|'vertical'}
export interface DirectionalBlurOptions extends BoundaryOptions {length?:Signal<number>;angle?:Signal<number>;samples?:number}
export interface ConvolutionOptions extends BoundaryOptions {kernel:Kernel3;divisor?:Signal<number>;bias?:Triple}
export interface SharpenOptions extends BoundaryOptions {amount?:Signal<number>}
export interface EmbossOptions extends BoundaryOptions {strength?:Signal<number>;bias?:Signal<number>}
export interface PosterizeOptions extends OutputOptions {levels?:Signal<number>;amount?:Signal<number>}
export interface ThresholdOptions extends OutputOptions {level?:Signal<number>;amount?:Signal<number>;low?:Triple;high?:Triple;invert?:boolean}
export interface ThresholdRGBOptions extends OutputOptions {levels?:Triple;amount?:Signal<number>;low?:Triple;high?:Triple;invert?:boolean}
export interface ImageMorphologyOptions extends BoundaryOptions {radius?:Signal<number>;axis?:'both'|'horizontal'|'vertical'}
export interface HueSaturationOptions extends OutputOptions {hue?:Signal<number>;saturation?:Signal<number>;lightness?:Signal<number>}
export interface ColorizeOptions extends OutputOptions {hue?:Signal<number>;saturation?:Signal<number>;lightness?:Signal<number>;amount?:Signal<number>}
export interface VibranceOptions extends OutputOptions {vibrance?:Signal<number>;saturation?:Signal<number>}
export interface PhotoFilterOptions extends OutputOptions {color?:Triple;density?:Signal<number>;preserveLuma?:boolean}
export interface GammaPedestalGainOptions extends OutputOptions {gamma?:Triple;pedestal?:Triple;gain?:Triple}
export interface ExposureOptions extends OutputOptions {stops?:Signal<number>;offset?:Triple;gamma?:Triple}
export interface LeaveColorOptions extends OutputOptions {color?:Triple;tolerance?:Signal<number>;softness?:Signal<number>;amount?:Signal<number>}
export interface ChangeColorOptions extends LeaveColorOptions {hue?:Signal<number>;saturation?:Signal<number>;lightness?:Signal<number>}
export interface ChangeToColorOptions extends LeaveColorOptions {replacement?:Triple}
export interface FoundationFilters extends UtilityFilters,SpatialFilters,StatisticsFilters {
 boxBlur(image:GpuPixelImage,options?:BoxBlurOptions):Promise<GpuPixelImage>;
 directionalBlur(image:GpuPixelImage,options?:DirectionalBlurOptions):Promise<GpuPixelImage>;
 convolve3x3(image:GpuPixelImage,options:ConvolutionOptions):Promise<GpuPixelImage>;
 sharpen(image:GpuPixelImage,options?:SharpenOptions):Promise<GpuPixelImage>;
 emboss(image:GpuPixelImage,options?:EmbossOptions):Promise<GpuPixelImage>;
 colorEmboss(image:GpuPixelImage,options?:EmbossOptions):Promise<GpuPixelImage>;
 posterize(image:GpuPixelImage,options?:PosterizeOptions):Promise<GpuPixelImage>;
 threshold(image:GpuPixelImage,options?:ThresholdOptions):Promise<GpuPixelImage>;
 thresholdRGB(image:GpuPixelImage,options?:ThresholdRGBOptions):Promise<GpuPixelImage>;
 erodeImage(image:GpuPixelImage,options?:ImageMorphologyOptions):Promise<GpuPixelImage>;
 dilateImage(image:GpuPixelImage,options?:ImageMorphologyOptions):Promise<GpuPixelImage>;
 hueSaturation(image:GpuPixelImage,options?:HueSaturationOptions):Promise<GpuPixelImage>;
 colorize(image:GpuPixelImage,options?:ColorizeOptions):Promise<GpuPixelImage>;
 vibrance(image:GpuPixelImage,options?:VibranceOptions):Promise<GpuPixelImage>;
 photoFilter(image:GpuPixelImage,options?:PhotoFilterOptions):Promise<GpuPixelImage>;
 gammaPedestalGain(image:GpuPixelImage,options?:GammaPedestalGainOptions):Promise<GpuPixelImage>;
 exposure(image:GpuPixelImage,options?:ExposureOptions):Promise<GpuPixelImage>;
 leaveColor(image:GpuPixelImage,options?:LeaveColorOptions):Promise<GpuPixelImage>;
 changeColor(image:GpuPixelImage,options?:ChangeColorOptions):Promise<GpuPixelImage>;
 changeToColor(image:GpuPixelImage,options?:ChangeToColorOptions):Promise<GpuPixelImage>;
}
