import type {FrameContext,Signal,ProfessionalSurface} from '@frameweave/engine';
import type {GpuPixelImage,GpuPixelScopeStats,GpuEffectChain} from '@frameweave/engine/native';
export type Triple=readonly [Signal<number>,Signal<number>,Signal<number>];
export interface OutputOptions {format?:'rgba16float'|'rgba32float';signal?:AbortSignal}
export interface LevelsOptions extends OutputOptions {inputBlack?:Triple;inputWhite?:Triple;outputBlack?:Triple;outputWhite?:Triple;gamma?:Triple;clampInput?:boolean}
export interface ChannelMixOptions extends OutputOptions {matrix?:readonly [Triple,Triple,Triple];offset?:Triple}
export type CurvePoints=readonly (readonly [number,number])[];
export interface CurvesOptions extends OutputOptions {red?:CurvePoints;green?:CurvePoints;blue?:CurvePoints}
export interface UnsharpMaskOptions extends OutputOptions {radius?:Signal<number>;amount?:Signal<number>;boundary?:'clamp'|'transparent'}
export interface LumaKeyOptions extends OutputOptions {low?:Signal<number>;high?:Signal<number>;invert?:boolean}
export interface ChromaKeyOptions extends OutputOptions {color?:Triple;inner?:Signal<number>;outer?:Signal<number>;invert?:boolean}
export interface DespillOptions extends OutputOptions {channel?:'red'|'green'|'blue';amount?:Signal<number>;limit?:'max'|'average'}
export interface MorphologyOptions extends OutputOptions {operation?:'erode'|'dilate'|'open'|'close';radius?:Signal<number>;axis?:'both'|'horizontal'|'vertical';boundary?:'transparent'|'clamp'}
export interface FeatherMatteOptions extends OutputOptions {radius?:Signal<number>;boundary?:'transparent'|'clamp'}
export interface MatteLevelsOptions extends OutputOptions {black?:Signal<number>;white?:Signal<number>;gamma?:Signal<number>;invert?:boolean}
export type PairSignal=readonly [Signal<number>,Signal<number>];
export interface BrightnessContrastOptions extends OutputOptions {brightness?:Signal<number>;contrast?:Signal<number>;pivot?:Signal<number>}
export interface TintOptions extends OutputOptions {black?:Triple;white?:Triple;amount?:Signal<number>;clampLuma?:boolean}
export interface TritoneOptions extends OutputOptions {shadows?:Triple;midtones?:Triple;highlights?:Triple;amount?:Signal<number>;clampLuma?:boolean}
export interface ColorBalanceOptions extends OutputOptions {shadows?:Triple;midtones?:Triple;highlights?:Triple;preserveLuma?:boolean}
export interface BlackAndWhiteOptions extends OutputOptions {weights?:readonly [Signal<number>,Signal<number>,Signal<number>,Signal<number>,Signal<number>,Signal<number>];amount?:Signal<number>}
export interface FilmGrainOptions extends OutputOptions {amount?:Signal<number>;seed?:number;animated?:boolean;colored?:boolean}
export interface VignetteOptions extends OutputOptions {center?:PairSignal;radius?:Signal<number>;amount?:Signal<number>;pinHighlights?:Signal<number>}
export interface SobelEdgesOptions extends OutputOptions {strength?:Signal<number>;color?:Triple;mode?:'overlay'|'only';boundary?:'clamp'|'transparent'}
export interface ReliefLightingOptions extends OutputOptions {contrast?:Signal<number>;angle?:Signal<number>;heightChannel?:'luma'|'red';boundary?:'clamp'|'transparent'}
export interface PixelateOptions extends OutputOptions {blockSize?:PairSignal;origin?:PairSignal}
export interface BlendOptions extends OutputOptions {opacity?:Signal<number>}
export type Channel='red'|'green'|'blue'|'alpha'|'zero'|'one';
export interface ChannelArithmeticOptions extends OutputOptions {operator?:'add'|'subtract'|'multiply'|'divide'|'min'|'max'|'difference';amount?:Signal<number>}
export interface SetChannelsOptions extends OutputOptions {red?:Channel;green?:Channel;blue?:Channel;alpha?:Channel}
export interface ShiftChannelsOptions extends OutputOptions {red?:Channel;green?:Channel;blue?:Channel;alpha?:Channel}
export interface RemoveColorMattingOptions extends OutputOptions {matte?:Triple}
export interface SolidCompositeOptions extends OutputOptions {color?:Triple;opacity?:Signal<number>}
export interface NoiseOptions extends OutputOptions {amount?:Signal<number>;seed?:number;colored?:boolean;animated?:boolean}
export interface DitherOptions extends OutputOptions {levels?:Signal<number>;amount?:Signal<number>}
export interface CheckerboardOptions extends OutputOptions {size?:Signal<number>;colorA?:Triple;colorB?:Triple;offset?:readonly [Signal<number>,Signal<number>]}
export interface GradientOptions extends OutputOptions {start?:readonly [Signal<number>,Signal<number>];end?:readonly [Signal<number>,Signal<number>];colorA?:Triple;colorB?:Triple}
export interface FourColorGradientOptions extends OutputOptions {topLeft?:Triple;topRight?:Triple;bottomLeft?:Triple;bottomRight?:Triple}
export interface GradientStop {position:number;color:Triple}
export interface GradientMapOptions extends OutputOptions {stops:readonly GradientStop[];amount?:Signal<number>;extend?:'linear'|'clamp'}
export interface ShadowHighlightOptions extends OutputOptions {shadows?:Signal<number>;highlights?:Signal<number>;shadowWidth?:Signal<number>;highlightWidth?:Signal<number>}
export interface SelectiveColorOptions extends OutputOptions {adjustments?:readonly (readonly [Signal<number>,Signal<number>,Signal<number>,Signal<number>])[];relative?:boolean}
export interface VideoLimiterOptions extends OutputOptions {black?:Signal<number>;white?:Signal<number>}
export interface UtilityFilters {
 channelArithmetic(image:GpuPixelImage,other:GpuPixelImage,options?:ChannelArithmeticOptions):Promise<GpuPixelImage>;
 setChannels(image:GpuPixelImage,options?:SetChannelsOptions):Promise<GpuPixelImage>;
 shiftChannels(image:GpuPixelImage,options?:ShiftChannelsOptions):Promise<GpuPixelImage>;
 removeColorMatting(image:GpuPixelImage,options?:RemoveColorMattingOptions):Promise<GpuPixelImage>;
 solidComposite(image:GpuPixelImage,options?:SolidCompositeOptions):Promise<GpuPixelImage>;
 noise(image:GpuPixelImage,options?:NoiseOptions):Promise<GpuPixelImage>;
 orderedDither(image:GpuPixelImage,options?:DitherOptions):Promise<GpuPixelImage>;
 checkerboard(image:GpuPixelImage,options?:CheckerboardOptions):Promise<GpuPixelImage>;
 linearGradient(image:GpuPixelImage,options?:GradientOptions):Promise<GpuPixelImage>;
 radialGradient(image:GpuPixelImage,options?:GradientOptions):Promise<GpuPixelImage>;
 fourColorGradient(image:GpuPixelImage,options?:FourColorGradientOptions):Promise<GpuPixelImage>;
 gradientMap(image:GpuPixelImage,options:GradientMapOptions):Promise<GpuPixelImage>;
 shadowHighlight(image:GpuPixelImage,options?:ShadowHighlightOptions):Promise<GpuPixelImage>;
 selectiveColor(image:GpuPixelImage,options?:SelectiveColorOptions):Promise<GpuPixelImage>;
 broadcastColors(image:GpuPixelImage,options?:VideoLimiterOptions):Promise<GpuPixelImage>;
 videoLimiter(image:GpuPixelImage,options?:VideoLimiterOptions):Promise<GpuPixelImage>;
}
export interface RadialBlurOptions extends BoundaryOptions {center?:PairSignal;amount?:Signal<number>;samples?:number}
export interface ChannelBlurOptions extends BoundaryOptions {radii?:readonly [Signal<number>,Signal<number>,Signal<number>,Signal<number>]}
export interface CompoundBlurOptions extends BoundaryOptions {radius?:Signal<number>}
export interface FindEdgesOptions extends BoundaryOptions {strength?:Signal<number>;invert?:boolean}
export interface MedianOptions extends BoundaryOptions {radius?:Signal<number>}
export interface DustOptions extends MedianOptions {threshold?:Signal<number>}
export interface BilateralOptions extends BoundaryOptions {radius?:Signal<number>;spatialSigma?:Signal<number>;rangeSigma?:Signal<number>}
export interface SmartBlurOptions extends BoundaryOptions {radius?:Signal<number>;threshold?:Signal<number>}
export interface SpatialFilters {
 radialBlur(image:GpuPixelImage,options?:RadialBlurOptions):Promise<GpuPixelImage>;
 zoomBlur(image:GpuPixelImage,options?:RadialBlurOptions):Promise<GpuPixelImage>;
 channelBlur(image:GpuPixelImage,options?:ChannelBlurOptions):Promise<GpuPixelImage>;
 compoundBlur(image:GpuPixelImage,map:GpuPixelImage,options?:CompoundBlurOptions):Promise<GpuPixelImage>;
 findEdges(image:GpuPixelImage,options?:FindEdgesOptions):Promise<GpuPixelImage>;
 median(image:GpuPixelImage,options?:MedianOptions):Promise<GpuPixelImage>;
 dustAndScratches(image:GpuPixelImage,options?:DustOptions):Promise<GpuPixelImage>;
 bilateralBlur(image:GpuPixelImage,options?:BilateralOptions):Promise<GpuPixelImage>;
 smartBlur(image:GpuPixelImage,options?:SmartBlurOptions):Promise<GpuPixelImage>;
}
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
export interface AutoLevelsOptions extends OutputOptions {amount?:Signal<number>;outputBlack?:Signal<number>;outputWhite?:Signal<number>}
export interface EqualizeOptions extends AutoLevelsOptions {bins?:number}
export type AutoColorOptions=Pick<AutoLevelsOptions,'amount'|'format'|'signal'>;
export interface StatisticsFilters {autoLevels(image:GpuPixelImage,options?:AutoLevelsOptions):Promise<GpuPixelImage>;autoContrast(image:GpuPixelImage,options?:AutoLevelsOptions):Promise<GpuPixelImage>;autoColor(image:GpuPixelImage,options?:AutoColorOptions):Promise<GpuPixelImage>;equalize(image:GpuPixelImage,options?:EqualizeOptions):Promise<GpuPixelImage>}
export interface ProfessionalFilters extends FoundationFilters {
 darken(foreground:GpuPixelImage,backdrop:GpuPixelImage,options?:BlendOptions):Promise<GpuPixelImage>;
 lighten(foreground:GpuPixelImage,backdrop:GpuPixelImage,options?:BlendOptions):Promise<GpuPixelImage>;
 difference(foreground:GpuPixelImage,backdrop:GpuPixelImage,options?:BlendOptions):Promise<GpuPixelImage>;
 exclusion(foreground:GpuPixelImage,backdrop:GpuPixelImage,options?:BlendOptions):Promise<GpuPixelImage>;
 overlay(foreground:GpuPixelImage,backdrop:GpuPixelImage,options?:BlendOptions):Promise<GpuPixelImage>;
 hardLight(foreground:GpuPixelImage,backdrop:GpuPixelImage,options?:BlendOptions):Promise<GpuPixelImage>;
 linearBurn(foreground:GpuPixelImage,backdrop:GpuPixelImage,options?:BlendOptions):Promise<GpuPixelImage>;
 subtractBlend(foreground:GpuPixelImage,backdrop:GpuPixelImage,options?:BlendOptions):Promise<GpuPixelImage>;
 linearLight(foreground:GpuPixelImage,backdrop:GpuPixelImage,options?:BlendOptions):Promise<GpuPixelImage>;
 pinLight(foreground:GpuPixelImage,backdrop:GpuPixelImage,options?:BlendOptions):Promise<GpuPixelImage>;
 brightnessContrast(image:GpuPixelImage,options?:BrightnessContrastOptions):Promise<GpuPixelImage>;
 tint(image:GpuPixelImage,options?:TintOptions):Promise<GpuPixelImage>;
 tritone(image:GpuPixelImage,options?:TritoneOptions):Promise<GpuPixelImage>;
 colorBalance(image:GpuPixelImage,options?:ColorBalanceOptions):Promise<GpuPixelImage>;
 blackAndWhite(image:GpuPixelImage,options?:BlackAndWhiteOptions):Promise<GpuPixelImage>;
 filmGrain(image:GpuPixelImage,options?:FilmGrainOptions):Promise<GpuPixelImage>;
 vignette(image:GpuPixelImage,options?:VignetteOptions):Promise<GpuPixelImage>;
 sobelEdges(image:GpuPixelImage,options?:SobelEdgesOptions):Promise<GpuPixelImage>;
 reliefLighting(image:GpuPixelImage,height:GpuPixelImage,options?:ReliefLightingOptions):Promise<GpuPixelImage>;
 pixelate(image:GpuPixelImage,options?:PixelateOptions):Promise<GpuPixelImage>;
 importImage(surface:ProfessionalSurface):Promise<GpuPixelImage>;
 extractMatte(input:GpuPixelImage,options?:OutputOptions):Promise<GpuPixelImage>;
 morphology(input:GpuPixelImage,options?:MorphologyOptions):Promise<GpuPixelImage>;
 featherMatte(input:GpuPixelImage,options?:FeatherMatteOptions):Promise<GpuPixelImage>;
 matteLevels(input:GpuPixelImage,options?:MatteLevelsOptions):Promise<GpuPixelImage>;
 applyMatte(input:GpuPixelImage,mask:GpuPixelImage,options?:OutputOptions):Promise<GpuPixelImage>;
 channelMix(input:GpuPixelImage,options?:ChannelMixOptions):Promise<GpuPixelImage>;
 levels(input:GpuPixelImage,options?:LevelsOptions):Promise<GpuPixelImage>;
 curves(input:GpuPixelImage,options?:CurvesOptions):Promise<GpuPixelImage>;
 unsharpMask(input:GpuPixelImage,options?:UnsharpMaskOptions):Promise<GpuPixelImage>;
 lumaKey(input:GpuPixelImage,options?:LumaKeyOptions):Promise<GpuPixelImage>;
 chromaKey(input:GpuPixelImage,options?:ChromaKeyOptions):Promise<GpuPixelImage>;
 despill(input:GpuPixelImage,options?:DespillOptions):Promise<GpuPixelImage>;
}
export interface ProcessOptions {context?:FrameContext;signal?:AbortSignal}
export type ImageRecipe=(image:GpuPixelImage,filters:ProfessionalFilters)=>Promise<GpuPixelImage>;
export declare function processImage(input:ProfessionalSurface,recipe:ImageRecipe,options?:ProcessOptions):Promise<ProfessionalSurface>;
export declare function imageStats():{version:1;policy:'gpu-only';closed:boolean;core:ReturnType<GpuEffectChain['stats']>|null;pixel:GpuPixelScopeStats|null};
