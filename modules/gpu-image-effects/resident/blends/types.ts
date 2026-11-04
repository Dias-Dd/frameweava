import type {Signal} from '../../../../src/core/types.ts';
import type {GpuPixelImage} from '../../../gpu-effects/pixel-types.ts';
import type {OutputOptions} from '../parameters.ts';
export interface BlendOptions extends OutputOptions {opacity?:Signal<number>}
export interface BlendFilters {
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
}
export const blendModes={darken:3,lighten:10,difference:23,exclusion:25,overlay:16,hardLight:18,linearBurn:7,subtractBlend:26,linearLight:19,pinLight:21} as const;
export type BlendName=keyof typeof blendModes;
