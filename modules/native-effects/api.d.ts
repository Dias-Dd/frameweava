import type {FrameContext} from '@frameweave/engine';
import type {GpuPixelImage,GpuPixelScopeStats} from '@frameweave/engine/native';
import type {CreativeFilters} from '../gpu-image-effects/resident/creative/types.ts';
import type {BlendFilters} from '../gpu-image-effects/resident/blends/types.ts';
import type {NativeProfessionalFilters} from './extended.ts';
import type {NativeRasterFilters} from './raster/filters.ts';
import type {NativeBuiltinFilters} from './builtin/filters.ts';
import type {NativePaImageFilters} from './pa/filters.ts';
export type {NativeProfessionalFilters,NativeRasterFilters,NativePaImageFilters,NativeBuiltinFilters};
export type * from '../gpu-image-effects/resident/creative/types.ts';
export type * from '../gpu-image-effects/resident/blends/types.ts';

export type NativeImageFilters=NativeProfessionalFilters;
export type LegacyNativeImageFilters=CreativeFilters&BlendFilters;
export type NativeImageRecipe=(image:GpuPixelImage,effects:NativeImageFilters)=>Promise<GpuPixelImage>;
export type NativeImageGenerator=(effects:NativeImageFilters)=>Promise<GpuPixelImage>;
export type NativeBuiltinRecipe=(image:GpuPixelImage,effects:NativeBuiltinFilters)=>Promise<GpuPixelImage>;
export type NativeRasterRecipe=(image:GpuPixelImage,effects:NativeRasterFilters)=>Promise<GpuPixelImage>;
export type NativePaRecipe=(image:GpuPixelImage,effects:NativePaImageFilters)=>Promise<GpuPixelImage>;
export type NativePaGenerator=(effects:NativePaImageFilters)=>Promise<GpuPixelImage>;
export interface NativeImageProcessOptions {context?:FrameContext;signal?:AbortSignal}
export interface NativeImageStats {
  version:1;backend:'native-wgpu';completion:'recorded-only';closed:boolean;
  processes:number;completedRecordings:number;createdImages:number;releasedImages:number;
  expiredFrameImages:number;cancelled:number;retainedImages:number;owner:GpuPixelScopeStats;
  createdDataBuffers:number;releasedDataBuffers:number;expiredFrameDataBuffers:number;
}
/** Input and return values are Stage-local GPU handles. The next recipe expires
 * this recipe's retained result. Group sequential effects in the same recipe. */
export declare function processImage(input:GpuPixelImage,recipe:NativeImageRecipe,options?:NativeImageProcessOptions):Promise<GpuPixelImage>;
export declare function imageStats():NativeImageStats;
/** Separate namespace: exposure/applyMatte retain their raster option contracts. */
export declare function processRaster(input:GpuPixelImage,recipe:NativeRasterRecipe,options?:NativeImageProcessOptions):Promise<GpuPixelImage>;
export declare function rasterStats():NativeImageStats;
/** Gaussian/Glow/Displacement/Coverage/Inner Shadow retain their original PA contracts. */
export declare function processPa(input:GpuPixelImage,recipe:NativePaRecipe,options?:NativeImageProcessOptions):Promise<GpuPixelImage>;
/** Explicit source generator; the recipe must return an image owned by its effect scope. */
export declare function generatePa(recipe:NativePaGenerator,options?:NativeImageProcessOptions):Promise<GpuPixelImage>;
export declare function paStats():NativeImageStats;

/** Source creation and builtin effects share the same Stage-local ownership contract. */
export declare function generateImage(recipe:NativeImageGenerator,options?:NativeImageProcessOptions):Promise<GpuPixelImage>;
export declare function processBuiltin(input:GpuPixelImage,recipe:NativeBuiltinRecipe,options?:NativeImageProcessOptions):Promise<GpuPixelImage>;
export declare function builtinStats():NativeImageStats;

export * from './domains.ts';

export {exrResource} from '@frameweave/engine/image-effects';
export type {ExrResourceOptions,ExrSelection} from '@frameweave/engine/image-effects';
