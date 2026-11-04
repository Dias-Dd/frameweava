import type {Signal} from '../../../../src/core/types.ts';
import type {GpuPixelImage} from '../../../gpu-effects/pixel-types.ts';
import type {OutputOptions,Triple} from '../parameters.ts';
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
