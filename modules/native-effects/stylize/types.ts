import type {Signal} from '../../../src/core/types.ts';
import type {ColorEncoding} from '../../../src/media/surface.ts';
import type {GpuPixelImage} from '../../gpu-effects/pixel-types.ts';
export type Triple=readonly [Signal<number>,Signal<number>,Signal<number>];
export interface StyleOutput {format?:'rgba16float'|'rgba32float';workingColor?:ColorEncoding;amount?:Signal<number>;signal?:AbortSignal}
export interface MosaicOptions extends StyleOutput {blockSize?:number}
export interface AdaptiveOptions extends MosaicOptions {variance?:Signal<number>}
export interface CrystalOptions extends StyleOutput {cellSize?:Signal<number>;jitter?:Signal<number>;seed?:number;edgeWidth?:Signal<number>}
export interface DotOptions extends StyleOutput {period?:Signal<number>;angle?:Signal<number>}
export interface ColorDotOptions extends StyleOutput {period?:Signal<number>;angles?:Triple}
export interface InkOptions extends StyleOutput {ink?:Triple;paper?:Triple;strength?:Signal<number>}
export interface HatchOptions extends InkOptions {period?:Signal<number>;lineWidth?:Signal<number>}
export interface EngraveOptions extends HatchOptions {angle?:Signal<number>}
export interface SketchOptions extends InkOptions {radius?:Signal<number>;epsilon?:Signal<number>}
export interface CharcoalOptions extends Omit<SketchOptions,'epsilon'> {grain?:Signal<number>;seed?:number}
export interface EdgeOptions extends InkOptions {threshold?:Signal<number>;softness?:Signal<number>}
export interface CartoonOptions extends Omit<EdgeOptions,'paper'> {levels?:Signal<number>}
export interface OilOptions extends StyleOutput {radius?:number;bins?:number}
export interface WatercolorOptions extends StyleOutput {radius?:Signal<number>;bleed?:Signal<number>;granulation?:Signal<number>;edgeRetention?:Signal<number>;seed?:number}
export interface BrushOptions extends StyleOutput {cellSize?:number;length?:Signal<number>;samples?:number;angle?:Signal<number>;angleJitter?:Signal<number>;jitter?:Signal<number>;coverage?:Signal<number>;seed?:number}
export interface ReliefOptions extends StyleOutput {strength?:Signal<number>;azimuth?:Signal<number>;elevation?:Signal<number>;ambient?:Signal<number>;diffuse?:Signal<number>;specular?:Signal<number>;shininess?:Signal<number>}
export interface GlassOptions extends ReliefOptions {refraction?:Signal<number>}
export interface SolarOptions extends StyleOutput {threshold?:Signal<number>}
export interface PaletteOptions extends StyleOutput {colors:readonly Triple[]}
export interface NativeStylizeFilters {
 mosaicMean(image:GpuPixelImage,options?:MosaicOptions):Promise<GpuPixelImage>;
 adaptiveMosaic(image:GpuPixelImage,options?:AdaptiveOptions):Promise<GpuPixelImage>;
 crystallize(image:GpuPixelImage,options?:Omit<CrystalOptions,'edgeWidth'>):Promise<GpuPixelImage>;
 stainedGlass(image:GpuPixelImage,options?:CrystalOptions):Promise<GpuPixelImage>;
 pointillism(image:GpuPixelImage,options?:Omit<CrystalOptions,'edgeWidth'>):Promise<GpuPixelImage>;
 lumaHalftone(image:GpuPixelImage,options?:DotOptions):Promise<GpuPixelImage>;
 colorHalftone(image:GpuPixelImage,options?:ColorDotOptions):Promise<GpuPixelImage>;
 crosshatch(image:GpuPixelImage,options?:HatchOptions):Promise<GpuPixelImage>;
 engraving(image:GpuPixelImage,options?:EngraveOptions):Promise<GpuPixelImage>;
 pencilSketch(image:GpuPixelImage,options?:SketchOptions):Promise<GpuPixelImage>;
 charcoal(image:GpuPixelImage,options?:CharcoalOptions):Promise<GpuPixelImage>;
 lineArt(image:GpuPixelImage,options?:EdgeOptions):Promise<GpuPixelImage>;
 cartoon(image:GpuPixelImage,options?:CartoonOptions):Promise<GpuPixelImage>;
 oilPaint(image:GpuPixelImage,options?:OilOptions):Promise<GpuPixelImage>;
 watercolor(image:GpuPixelImage,options?:WatercolorOptions):Promise<GpuPixelImage>;
 brushStrokes(image:GpuPixelImage,options?:BrushOptions):Promise<GpuPixelImage>;
 glassRelief(image:GpuPixelImage,height:GpuPixelImage,options?:GlassOptions):Promise<GpuPixelImage>;
 plasticRelief(image:GpuPixelImage,options?:ReliefOptions):Promise<GpuPixelImage>;
 solarize(image:GpuPixelImage,options?:SolarOptions):Promise<GpuPixelImage>;
 paletteQuantize(image:GpuPixelImage,options:PaletteOptions):Promise<GpuPixelImage>;
}
export const nativeStylizeNames=['mosaicMean','adaptiveMosaic','crystallize','stainedGlass','pointillism','lumaHalftone','colorHalftone','crosshatch','engraving','pencilSketch','charcoal','lineArt','cartoon','oilPaint','watercolor','brushStrokes','glassRelief','plasticRelief','solarize','paletteQuantize'] as const satisfies readonly (keyof NativeStylizeFilters)[];
