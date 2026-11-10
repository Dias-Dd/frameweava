import {EngineError} from '@frameweave/engine';
import type {GpuPixelImage} from '@frameweave/engine/native';
import type {NativeImageRecipe,NativeImageGenerator,NativeBuiltinRecipe,NativeRasterRecipe,NativePaRecipe,NativePaGenerator,NativeImageProcessOptions,NativeImageStats} from './api.d.ts';
export type * from './api.d.ts';
export async function processImage(_input:GpuPixelImage,_recipe:NativeImageRecipe,_options?:NativeImageProcessOptions):Promise<GpuPixelImage>{
 throw new EngineError('E_NATIVE_EFFECTS_BINDING','Install native-image-effects and import its managed Stage binding');
}
export function imageStats():NativeImageStats{throw new EngineError('E_NATIVE_EFFECTS_BINDING','Use the managed Native Stage binding');}
export async function processRaster(_input:GpuPixelImage,_recipe:NativeRasterRecipe,_options?:NativeImageProcessOptions):Promise<GpuPixelImage>{throw new EngineError('E_NATIVE_EFFECTS_BINDING','Use the managed Native Stage binding');}
export function rasterStats():NativeImageStats{throw new EngineError('E_NATIVE_EFFECTS_BINDING','Use the managed Native Stage binding');}
export async function processPa(_input:GpuPixelImage,_recipe:NativePaRecipe,_options?:NativeImageProcessOptions):Promise<GpuPixelImage>{throw new EngineError('E_NATIVE_EFFECTS_BINDING','Use the managed Native Stage binding');}
export async function generatePa(_recipe:NativePaGenerator,_options?:NativeImageProcessOptions):Promise<GpuPixelImage>{throw new EngineError('E_NATIVE_EFFECTS_BINDING','Use the managed Native Stage binding');}
export function paStats():NativeImageStats{throw new EngineError('E_NATIVE_EFFECTS_BINDING','Use the managed Native Stage binding');}

export async function generateImage(_recipe:NativeImageGenerator,_options?:NativeImageProcessOptions):Promise<GpuPixelImage>{throw new EngineError('E_NATIVE_EFFECTS_BINDING','Use the managed Native Stage binding');}
export async function processBuiltin(_input:GpuPixelImage,_recipe:NativeBuiltinRecipe,_options?:NativeImageProcessOptions):Promise<GpuPixelImage>{throw new EngineError('E_NATIVE_EFFECTS_BINDING','Use the managed Native Stage binding');}
export function builtinStats():NativeImageStats{throw new EngineError('E_NATIVE_EFFECTS_BINDING','Use the managed Native Stage binding');}

export * from './domains.ts';

export {exrResource} from '@frameweave/engine/image-effects';
export type {ExrResourceOptions,ExrSelection} from '@frameweave/engine/image-effects';
