import type {Signal} from '../../../../src/core/types.ts';
import type {GpuPixelImage} from '../../../gpu-effects/pixel-types.ts';
import type {BoundaryOptions,PairSignal} from './types.ts';
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
