import type {Signal} from '../../../../src/core/types.ts';
import type {GpuPixelImage} from '../../../gpu-effects/pixel-types.ts';
import type {OutputOptions,Triple} from '../parameters.ts';
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
export interface CreativeFilters {
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
}
