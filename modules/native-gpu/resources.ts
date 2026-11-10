import type {GpuPixelImage,GpuPixelImageInfo} from '../gpu-effects/pixel-types.ts';
import type {NativeFontGlyphResource} from './font-image.ts';
export type {NativeFontGlyphResource} from './font-image.ts';
export {fontGlyphResource} from './font-image.ts';
import type {ExrSelection} from '../../src/media/exr-selection.ts';
export interface NativeRasterResource {
 /** Manifest ID or the exact declared URL supplied by init.resources. */
 version:1;id:string;decode:'surface-v2'|'icc-sdr';
 output:Omit<GpuPixelImageInfo,'version'>;
 missingProfile?:'error'|'assume-srgb';
}
export interface NativeExrResource {
  version:1;id:string;decode:'exr';selection:ExrSelection;
  output:Omit<GpuPixelImageInfo,'version'>;
}
/** Explicit source presentation time; frame index is zero-based display order. */
export interface NativeVideoResource {
 version:1;id:string;decode:'video';decoder:'cpu'|'hardware';
 position:{frame:number}|{num:number;den:number};boundary:'error'|'clamp'|'loop';
 interpretation:import('../../src/media/surface.ts').ColorEncoding;metadataPolicy:'validate'|'override';
 output:Omit<GpuPixelImageInfo,'version'>;cacheBytes?:number;
}
export type NativeImageResource=NativeRasterResource|NativeExrResource|NativeFontGlyphResource;
export type NativeResource=NativeImageResource|NativeVideoResource;
export interface NativeResourceScope {
 /** Byte-exact declared asset as owner-local read-only raw u32 storage. */
 importBufferResource(source:import('./binary-resource.ts').NativeBufferResource,options?:{signal?:AbortSignal}):Promise<import('./binary-resource.ts').NativeResourceBuffer>;
 /** Resolve only a declared Resource through the verified host adapter. */
 importResource(source:NativeResource,options?:{signal?:AbortSignal}):Promise<GpuPixelImage>;
}
