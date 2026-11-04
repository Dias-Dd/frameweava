import * as domains from './domains.ts';
import {nativeLibraryBindings} from '../native-gpu/library-bindings.ts';
import type {NativePluginInit} from '../../src/plugins/sdk.ts';
import {EngineError} from '../../src/core/errors.ts';
import {createNativeProfessionalEffects} from './extended.ts';
import {createNativeRasterEffects} from './raster/filters.ts';
import {createNativeBuiltinEffects} from './builtin/filters.ts';
import {createNativePaImageEffects} from './pa/filters.ts';
/** Native bindings-schema v2 initializer. Main owns the immutable package
 * version/manifest. The existing loader supplies and revokes the borrowed scope. */
export function initialize(init:NativePluginInit){
 if(init.backend!=='native-gpu'||!init.gpu)throw new EngineError('E_PACKAGE_CAPABILITY','Native GPU bindings require the loader-provided native scope');
 const domainLibrary=nativeLibraryBindings(init,domains);const effects=createNativeProfessionalEffects({gpu:init.gpu}),raster=createNativeRasterEffects({gpu:init.gpu}),pa=createNativePaImageEffects({gpu:init.gpu}),builtin=createNativeBuiltinEffects({gpu:init.gpu});
 return {exports:{...domainLibrary.exports,processImage:effects.processImage,generateImage:effects.generateImage,processBuiltin:builtin.processImage,builtinStats:builtin.stats,imageStats:effects.stats,processRaster:raster.processImage,rasterStats:raster.stats,processPa:pa.processImage,generatePa:pa.generateImage,paStats:pa.stats},async dispose(){const results=await Promise.allSettled([domainLibrary.dispose(),effects.dispose(),raster.dispose(),pa.dispose(),builtin.dispose()]);const failure=results.find(r=>r.status==='rejected');if(failure?.status==='rejected')throw failure.reason;}};
}
