import type {Signal} from '../../../src/core/types.ts';
import type {GpuPixelImage} from '../../gpu-effects/pixel-types.ts';
import type {GpuDataBuffer} from '../../gpu-effects/compute-types.ts';

export type Color=readonly [Signal<number>,Signal<number>,Signal<number>];
export type Point=readonly [Signal<number>,Signal<number>];
/** Allocation admission stays with the existing Native Stage/session budget. */
export interface KeyingOutput {format?:'rgba16float'|'rgba32float';signal?:AbortSignal}
export interface ColorKeyOptions extends KeyingOutput {color?:Color;tolerance?:Signal<number>;softness?:Signal<number>}
export interface ColorRangeOptions extends KeyingOutput {space?:'rgb'|'yuv'|'lab';minimum:Color;maximum:Color;softness?:Signal<number>}
export interface ExtractKeyOptions extends KeyingOutput {channel?:'luma'|'red'|'green'|'blue';black?:Signal<number>;blackSoftness?:Signal<number>;white?:Signal<number>;whiteSoftness?:Signal<number>}
export interface DifferenceMatteOptions extends KeyingOutput {tolerance?:Signal<number>;softness?:Signal<number>;preblurSigma?:Signal<number>;compare?:'rgb'|'luma'}
export interface ColorDifferenceOptions extends KeyingOutput {screen?:'green'|'blue';balance?:Signal<number>;tolerance?:Signal<number>;softness?:Signal<number>}
export interface ScreenKeyOptions extends KeyingOutput {color?:Color;gain?:Signal<number>;balance?:Signal<number>;clipBlack?:Signal<number>;clipWhite?:Signal<number>;gamma?:Signal<number>;despill?:Signal<number>;preblurSigma?:Signal<number>}
export interface SpillOptions extends KeyingOutput {channel?:'auto'|'red'|'green'|'blue';amount?:Signal<number>;balance?:Signal<number>;preserveLuma?:boolean;tint?:Color}
export interface UnmultOptions extends KeyingOutput {background?:'black'|'white';strength?:Signal<number>}
export interface InnerOuterOptions extends KeyingOutput {edgeSigma?:Signal<number>;edgeContrast?:Signal<number>}
export interface KeyCleanerOptions extends KeyingOutput {radius?:Signal<number>;edgeContrast?:Signal<number>;smoothAmount?:Signal<number>;preserveDetail?:Signal<number>;colorRecovery?:Signal<number>}
export interface ChokerOptions extends KeyingOutput {choke?:Signal<number>;softenSigma?:Signal<number>;contrast?:Signal<number>}
export interface RefineOptions extends KeyingOutput {radius?:Signal<number>;epsilon?:Signal<number>;mode?:'soft'|'hard';choke?:Signal<number>;contrast?:Signal<number>;decontaminate?:Signal<number>}
export interface DecontaminateOptions extends KeyingOutput {radius?:Signal<number>;amount?:Signal<number>;edgeWidth?:Signal<number>}
export interface EdgeExtendOptions extends KeyingOutput {radius?:Signal<number>;alphaThreshold?:Signal<number>}
export interface LightWrapOptions extends KeyingOutput {sigma?:Signal<number>;amount?:Signal<number>;edgeWidth?:Signal<number>;mode?:'add'|'screen'}
export interface DistanceOptions extends KeyingOutput {threshold?:Signal<number>}
/** Same-recipe typed GPU field. It is not a color image, persistent JSON value
 * or Stage port. The producing recipe owns and releases the buffer. */
export interface MatteDistanceField {readonly kind:'native-matte-distance';readonly version:1;readonly width:number;readonly height:number;readonly units:'pixels';readonly buffer:GpuDataBuffer}
export interface DistanceFeatherOptions extends KeyingOutput {radius?:Signal<number>;offset?:Signal<number>;threshold?:Signal<number>}
export interface OutlineOptions extends KeyingOutput {width?:Signal<number>;position?:'inside'|'outside'|'center';color?:Color;opacity?:Signal<number>;threshold?:Signal<number>}
export interface BevelOptions extends DistanceOptions {width?:Signal<number>;height?:Signal<number>;azimuth?:Signal<number>;elevation?:Signal<number>;ambient?:Signal<number>;strength?:Signal<number>}
export interface GradientOptions extends KeyingOutput {radius?:Signal<number>;boundary?:'transparent'|'clamp'}
export interface MedianOptions extends KeyingOutput {radius?:Signal<number>;boundary?:'transparent'|'clamp'}
export interface ThresholdOptions extends KeyingOutput {threshold?:Signal<number>;invert?:boolean}
export interface QuantizeOptions extends KeyingOutput {levels?:Signal<number>;dither?:Signal<number>;seed?:number}
export interface WireRemoveOptions extends KeyingOutput {start:Point;end:Point;width?:Signal<number>;feather?:Signal<number>}

/** Image methods return provisional recipe-owned PM images. Sizes, scene-linear
 * color and default precision inherit the input. Only matteDistance returns a
 * recipe-local typed field; the other methods accept ordinary image+options. */
export interface NativeKeyingFilters {
 colorKey(image:GpuPixelImage,options?:ColorKeyOptions):Promise<GpuPixelImage>;
 colorRangeKey(image:GpuPixelImage,options:ColorRangeOptions):Promise<GpuPixelImage>;
 extractKey(image:GpuPixelImage,options?:ExtractKeyOptions):Promise<GpuPixelImage>;
 differenceMatte(image:GpuPixelImage,background:GpuPixelImage,options?:DifferenceMatteOptions):Promise<GpuPixelImage>;
 colorDifferenceKey(image:GpuPixelImage,options?:ColorDifferenceOptions):Promise<GpuPixelImage>;
 screenKey(image:GpuPixelImage,options?:ScreenKeyOptions):Promise<GpuPixelImage>;
 advancedSpillSuppressor(image:GpuPixelImage,options?:SpillOptions):Promise<GpuPixelImage>;
 unmult(image:GpuPixelImage,options?:UnmultOptions):Promise<GpuPixelImage>;
 innerOuterKey(image:GpuPixelImage,inner:GpuPixelImage,outer:GpuPixelImage,options?:InnerOuterOptions):Promise<GpuPixelImage>;
 keyCleaner(image:GpuPixelImage,options?:KeyCleanerOptions):Promise<GpuPixelImage>;
 matteChoker(image:GpuPixelImage,options?:ChokerOptions):Promise<GpuPixelImage>;
 refineMatte(image:GpuPixelImage,options?:RefineOptions):Promise<GpuPixelImage>;
 edgeDecontaminate(image:GpuPixelImage,options?:DecontaminateOptions):Promise<GpuPixelImage>;
 edgeExtend(image:GpuPixelImage,options?:EdgeExtendOptions):Promise<GpuPixelImage>;
 lightWrap(image:GpuPixelImage,background:GpuPixelImage,options?:LightWrapOptions):Promise<GpuPixelImage>;
 matteDistance(image:GpuPixelImage,options?:DistanceOptions):Promise<MatteDistanceField>;
 distanceFeather(image:GpuPixelImage,options?:DistanceFeatherOptions):Promise<GpuPixelImage>;
 matteOutline(image:GpuPixelImage,options?:OutlineOptions):Promise<GpuPixelImage>;
 matteBevel(image:GpuPixelImage,options?:BevelOptions):Promise<GpuPixelImage>;
 matteGradient(image:GpuPixelImage,options?:GradientOptions):Promise<GpuPixelImage>;
 matteMedian(image:GpuPixelImage,options?:MedianOptions):Promise<GpuPixelImage>;
 matteThreshold(image:GpuPixelImage,options?:ThresholdOptions):Promise<GpuPixelImage>;
 matteQuantize(image:GpuPixelImage,options?:QuantizeOptions):Promise<GpuPixelImage>;
 wireRemove(image:GpuPixelImage,options:WireRemoveOptions):Promise<GpuPixelImage>;
}
/** Planned domain surface, not a runtime availability or verification registry. */
export const plannedKeyingNames=['colorKey','colorRangeKey','extractKey','differenceMatte','colorDifferenceKey','screenKey','advancedSpillSuppressor','unmult','innerOuterKey','keyCleaner','matteChoker','refineMatte','edgeDecontaminate','edgeExtend','lightWrap','matteDistance','distanceFeather','matteOutline','matteBevel','matteGradient','matteMedian','matteThreshold','matteQuantize','wireRemove'] as const satisfies readonly (keyof NativeKeyingFilters)[];
