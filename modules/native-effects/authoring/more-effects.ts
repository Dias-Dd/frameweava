/** Original algorithms/options only; no shaders or CPU pixel substitutes. */
import type {GpuPixelImage} from '../../gpu-effects/pixel-types.ts';
import type {ImageEffect,ImageEffectFactory,ImageInput} from './types.ts';
import {withImageSources} from './runtime.ts';
import {createNativeStylizeEffects} from '../stylize/index.ts';
import type {NativeStylizeFilters} from '../stylize/types.ts';
import {createNativeClosureImageEffects} from '../closure-images/index.ts';
import type {NativeClosureImageFilters} from '../closure-images/types.ts';
import {createNativeGradingEffects} from '../grading/index.ts';
import type {NativeGradingFilters} from '../grading/types.ts';
import {createNativeRasterEffects} from '../raster/filters.ts';
import type {NativeRasterFilters} from '../raster/filters.ts';
import {createNativePaImageEffects} from '../pa/filters.ts';
import type {NativePaImageFilters} from '../pa/filters.ts';
import {createNativeBuiltinEffects} from '../builtin/filters.ts';
import type {NativeBuiltinFilters} from '../builtin/filters.ts';

type Options<F extends (...args:never[])=>Promise<GpuPixelImage>>=NonNullable<Parameters<F>[1]>;
function unary<F,T>(name:string,factory:ImageEffectFactory<F>,invoke:(fx:F,image:GpuPixelImage,options:T)=>Promise<GpuPixelImage>,options:T):ImageEffect {
 const effect:ImageEffect=(image,frame)=>frame.process(factory,image,(source,fx)=>invoke(fx,source,options));Object.defineProperty(effect,'name',{value:name});return effect;
}
export const mosaicMean=(options:Options<NativeStylizeFilters['mosaicMean']>={}):ImageEffect=>unary('mosaicMean',createNativeStylizeEffects,(f,i,o)=>f.mosaicMean(i,o),options);
export const adaptiveMosaic=(options:Options<NativeStylizeFilters['adaptiveMosaic']>={}):ImageEffect=>unary('adaptiveMosaic',createNativeStylizeEffects,(f,i,o)=>f.adaptiveMosaic(i,o),options);
export const crystallize=(options:Options<NativeStylizeFilters['crystallize']>={}):ImageEffect=>unary('crystallize',createNativeStylizeEffects,(f,i,o)=>f.crystallize(i,o),options);
export const stainedGlass=(options:Options<NativeStylizeFilters['stainedGlass']>={}):ImageEffect=>unary('stainedGlass',createNativeStylizeEffects,(f,i,o)=>f.stainedGlass(i,o),options);
export const pointillism=(options:Options<NativeStylizeFilters['pointillism']>={}):ImageEffect=>unary('pointillism',createNativeStylizeEffects,(f,i,o)=>f.pointillism(i,o),options);
export const lumaHalftone=(options:Options<NativeStylizeFilters['lumaHalftone']>={}):ImageEffect=>unary('lumaHalftone',createNativeStylizeEffects,(f,i,o)=>f.lumaHalftone(i,o),options);
export const colorHalftone=(options:Options<NativeStylizeFilters['colorHalftone']>={}):ImageEffect=>unary('colorHalftone',createNativeStylizeEffects,(f,i,o)=>f.colorHalftone(i,o),options);
export const crosshatch=(options:Options<NativeStylizeFilters['crosshatch']>={}):ImageEffect=>unary('crosshatch',createNativeStylizeEffects,(f,i,o)=>f.crosshatch(i,o),options);
export const engraving=(options:Options<NativeStylizeFilters['engraving']>={}):ImageEffect=>unary('engraving',createNativeStylizeEffects,(f,i,o)=>f.engraving(i,o),options);
export const pencilSketch=(options:Options<NativeStylizeFilters['pencilSketch']>={}):ImageEffect=>unary('pencilSketch',createNativeStylizeEffects,(f,i,o)=>f.pencilSketch(i,o),options);
export const charcoal=(options:Options<NativeStylizeFilters['charcoal']>={}):ImageEffect=>unary('charcoal',createNativeStylizeEffects,(f,i,o)=>f.charcoal(i,o),options);
export const lineArt=(options:Options<NativeStylizeFilters['lineArt']>={}):ImageEffect=>unary('lineArt',createNativeStylizeEffects,(f,i,o)=>f.lineArt(i,o),options);
export const cartoon=(options:Options<NativeStylizeFilters['cartoon']>={}):ImageEffect=>unary('cartoon',createNativeStylizeEffects,(f,i,o)=>f.cartoon(i,o),options);
export const oilPaint=(options:Options<NativeStylizeFilters['oilPaint']>={}):ImageEffect=>unary('oilPaint',createNativeStylizeEffects,(f,i,o)=>f.oilPaint(i,o),options);
export const watercolor=(options:Options<NativeStylizeFilters['watercolor']>={}):ImageEffect=>unary('watercolor',createNativeStylizeEffects,(f,i,o)=>f.watercolor(i,o),options);
export const brushStrokes=(options:Options<NativeStylizeFilters['brushStrokes']>={}):ImageEffect=>unary('brushStrokes',createNativeStylizeEffects,(f,i,o)=>f.brushStrokes(i,o),options);
export const plasticRelief=(options:Options<NativeStylizeFilters['plasticRelief']>={}):ImageEffect=>unary('plasticRelief',createNativeStylizeEffects,(f,i,o)=>f.plasticRelief(i,o),options);
export const solarize=(options:Options<NativeStylizeFilters['solarize']>={}):ImageEffect=>unary('solarize',createNativeStylizeEffects,(f,i,o)=>f.solarize(i,o),options);
export const paletteQuantize=(options:Options<NativeStylizeFilters['paletteQuantize']>):ImageEffect=>unary('paletteQuantize',createNativeStylizeEffects,(f,i,o)=>f.paletteQuantize(i,o),options);
export const floMotion=(options:Options<NativeClosureImageFilters['floMotion']>={}):ImageEffect=>unary('floMotion',createNativeClosureImageEffects,(f,i,o)=>f.floMotion(i,o),options);
export const pageTurn=(options:Options<NativeClosureImageFilters['pageTurn']>={}):ImageEffect=>unary('pageTurn',createNativeClosureImageEffects,(f,i,o)=>f.pageTurn(i,o),options);
export const ripplePulse=(options:Options<NativeClosureImageFilters['ripplePulse']>={}):ImageEffect=>unary('ripplePulse',createNativeClosureImageEffects,(f,i,o)=>f.ripplePulse(i,o),options);
export const slantWarp=(options:Options<NativeClosureImageFilters['slantWarp']>={}):ImageEffect=>unary('slantWarp',createNativeClosureImageEffects,(f,i,o)=>f.slantWarp(i,o),options);
export const smearWarp=(options:Options<NativeClosureImageFilters['smearWarp']>):ImageEffect=>unary('smearWarp',createNativeClosureImageEffects,(f,i,o)=>f.smearWarp(i,o),options);
export const splitWarp=(options:Options<NativeClosureImageFilters['splitWarp']>):ImageEffect=>unary('splitWarp',createNativeClosureImageEffects,(f,i,o)=>f.splitWarp(i,o),options);
export const splitCorners=(options:Options<NativeClosureImageFilters['splitCorners']>={}):ImageEffect=>unary('splitCorners',createNativeClosureImageEffects,(f,i,o)=>f.splitCorners(i,o),options);
export const reshapeWarp=(options:Options<NativeClosureImageFilters['reshapeWarp']>):ImageEffect=>unary('reshapeWarp',createNativeClosureImageEffects,(f,i,o)=>f.reshapeWarp(i,o),options);
export const rollingShutterWarp=(options:Options<NativeClosureImageFilters['rollingShutterWarp']>={}):ImageEffect=>unary('rollingShutterWarp',createNativeClosureImageEffects,(f,i,o)=>f.rollingShutterWarp(i,o),options);
export const envelopeWarp=(options:Options<NativeClosureImageFilters['envelopeWarp']>={}):ImageEffect=>unary('envelopeWarp',createNativeClosureImageEffects,(f,i,o)=>f.envelopeWarp(i,o),options);
export const blockLoad=(options:Options<NativeClosureImageFilters['blockLoad']>={}):ImageEffect=>unary('blockLoad',createNativeClosureImageEffects,(f,i,o)=>f.blockLoad(i,o),options);
export const burnFilm=(options:Options<NativeClosureImageFilters['burnFilm']>={}):ImageEffect=>unary('burnFilm',createNativeClosureImageEffects,(f,i,o)=>f.burnFilm(i,o),options);
export const hexTile=(options:Options<NativeClosureImageFilters['hexTile']>={}):ImageEffect=>unary('hexTile',createNativeClosureImageEffects,(f,i,o)=>f.hexTile(i,o),options);
export const smoothPosterize=(options:Options<NativeClosureImageFilters['smoothPosterize']>={}):ImageEffect=>unary('smoothPosterize',createNativeClosureImageEffects,(f,i,o)=>f.smoothPosterize(i,o),options);
export const roughenEdges=(options:Options<NativeClosureImageFilters['roughenEdges']>={}):ImageEffect=>unary('roughenEdges',createNativeClosureImageEffects,(f,i,o)=>f.roughenEdges(i,o),options);
export const scatter=(options:Options<NativeClosureImageFilters['scatter']>={}):ImageEffect=>unary('scatter',createNativeClosureImageEffects,(f,i,o)=>f.scatter(i,o),options);
export const strobe=(options:Options<NativeClosureImageFilters['strobe']>={}):ImageEffect=>unary('strobe',createNativeClosureImageEffects,(f,i,o)=>f.strobe(i,o),options);
export const seededMatte=(options:Options<NativeClosureImageFilters['seededMatte']>):ImageEffect=>unary('seededMatte',createNativeClosureImageEffects,(f,i,o)=>f.seededMatte(i,o),options);
export const ellipseMask=(options:Options<NativeClosureImageFilters['ellipseMask']>={}):ImageEffect=>unary('ellipseMask',createNativeClosureImageEffects,(f,i,o)=>f.ellipseMask(i,o),options);
export const gridTexture=(options:Options<NativeClosureImageFilters['gridTexture']>={}):ImageEffect=>unary('gridTexture',createNativeClosureImageEffects,(f,i,o)=>f.gridTexture(i,o),options);
export const beam=(options:Options<NativeClosureImageFilters['beam']>):ImageEffect=>unary('beam',createNativeClosureImageEffects,(f,i,o)=>f.beam(i,o),options);
export const lightning=(options:Options<NativeClosureImageFilters['lightning']>):ImageEffect=>unary('lightning',createNativeClosureImageEffects,(f,i,o)=>f.lightning(i,o),options);
export const threadsTexture=(options:Options<NativeClosureImageFilters['threadsTexture']>={}):ImageEffect=>unary('threadsTexture',createNativeClosureImageEffects,(f,i,o)=>f.threadsTexture(i,o),options);
export const radioWaves=(options:Options<NativeClosureImageFilters['radioWaves']>={}):ImageEffect=>unary('radioWaves',createNativeClosureImageEffects,(f,i,o)=>f.radioWaves(i,o),options);
export const paintBucket=(options:Options<NativeClosureImageFilters['paintBucket']>):ImageEffect=>unary('paintBucket',createNativeClosureImageEffects,(f,i,o)=>f.paintBucket(i,o),options);
export const radialShadow=(options:Options<NativeClosureImageFilters['radialShadow']>={}):ImageEffect=>unary('radialShadow',createNativeClosureImageEffects,(f,i,o)=>f.radialShadow(i,o),options);
export const printerLights=(options:Options<NativeGradingFilters['printerLights']>={}):ImageEffect=>unary('printerLights',createNativeGradingEffects,(f,i,o)=>f.printerLights(i,o),options);
export const contrastPivot=(options:Options<NativeGradingFilters['contrastPivot']>={}):ImageEffect=>unary('contrastPivot',createNativeGradingEffects,(f,i,o)=>f.contrastPivot(i,o),options);
export const logContrast=(options:Options<NativeGradingFilters['logContrast']>={}):ImageEffect=>unary('logContrast',createNativeGradingEffects,(f,i,o)=>f.logContrast(i,o),options);
export const lumaCurve=(options:Options<NativeGradingFilters['lumaCurve']>):ImageEffect=>unary('lumaCurve',createNativeGradingEffects,(f,i,o)=>f.lumaCurve(i,o),options);
export const hueVsHue=(options:Options<NativeGradingFilters['hueVsHue']>):ImageEffect=>unary('hueVsHue',createNativeGradingEffects,(f,i,o)=>f.hueVsHue(i,o),options);
export const hueVsSaturation=(options:Options<NativeGradingFilters['hueVsSaturation']>):ImageEffect=>unary('hueVsSaturation',createNativeGradingEffects,(f,i,o)=>f.hueVsSaturation(i,o),options);
export const hueVsLuminance=(options:Options<NativeGradingFilters['hueVsLuminance']>):ImageEffect=>unary('hueVsLuminance',createNativeGradingEffects,(f,i,o)=>f.hueVsLuminance(i,o),options);
export const saturationVsSaturation=(options:Options<NativeGradingFilters['saturationVsSaturation']>):ImageEffect=>unary('saturationVsSaturation',createNativeGradingEffects,(f,i,o)=>f.saturationVsSaturation(i,o),options);
export const luminanceVsSaturation=(options:Options<NativeGradingFilters['luminanceVsSaturation']>):ImageEffect=>unary('luminanceVsSaturation',createNativeGradingEffects,(f,i,o)=>f.luminanceVsSaturation(i,o),options);
export const saturationVsLuminance=(options:Options<NativeGradingFilters['saturationVsLuminance']>):ImageEffect=>unary('saturationVsLuminance',createNativeGradingEffects,(f,i,o)=>f.saturationVsLuminance(i,o),options);
export const splitTone=(options:Options<NativeGradingFilters['splitTone']>={}):ImageEffect=>unary('splitTone',createNativeGradingEffects,(f,i,o)=>f.splitTone(i,o),options);
export const highlightRolloff=(options:Options<NativeGradingFilters['highlightRolloff']>={}):ImageEffect=>unary('highlightRolloff',createNativeGradingEffects,(f,i,o)=>f.highlightRolloff(i,o),options);
export const shadowRolloff=(options:Options<NativeGradingFilters['shadowRolloff']>={}):ImageEffect=>unary('shadowRolloff',createNativeGradingEffects,(f,i,o)=>f.shadowRolloff(i,o),options);
export const gamutCompress=(options:Options<NativeGradingFilters['gamutCompress']>={}):ImageEffect=>unary('gamutCompress',createNativeGradingEffects,(f,i,o)=>f.gamutCompress(i,o),options);
export const bleachBypass=(options:Options<NativeGradingFilters['bleachBypass']>={}):ImageEffect=>unary('bleachBypass',createNativeGradingEffects,(f,i,o)=>f.bleachBypass(i,o),options);
export const fill=(options:Options<NativeRasterFilters['fill']>={}):ImageEffect=>unary('fill',createNativeRasterEffects,(f,i,o)=>f.fill(i,o),options);
export const alphaToRGB=(options:Options<NativeRasterFilters['alphaToRGB']>={}):ImageEffect=>unary('alphaToRGB',createNativeRasterEffects,(f,i,o)=>f.alphaToRGB(i,o),options);
export const flattenBlack=(options:Options<NativeRasterFilters['flattenBlack']>={}):ImageEffect=>unary('flattenBlack',createNativeRasterEffects,(f,i,o)=>f.flattenBlack(i,o),options);
export const tile=(options:Options<NativeRasterFilters['tile']>={}):ImageEffect=>unary('tile',createNativeRasterEffects,(f,i,o)=>f.tile(i,o),options);
export const invertMatte=(options:Options<NativeRasterFilters['invertMatte']>={}):ImageEffect=>unary('invertMatte',createNativeRasterEffects,(f,i,o)=>f.invertMatte(i,o),options);
export const offsetRGB=(options:Options<NativeRasterFilters['offsetRGB']>={}):ImageEffect=>unary('offsetRGB',createNativeRasterEffects,(f,i,o)=>f.offsetRGB(i,o),options);
export const innerShadow=(options:Options<NativePaImageFilters['innerShadow']>={}):ImageEffect=>unary('innerShadow',createNativePaImageEffects,(f,i,o)=>f.innerShadow(i,o),options);
export const displacement=(options:Options<NativeBuiltinFilters['displacement']>={}):ImageEffect=>unary('displacement',createNativeBuiltinEffects,(f,i,o)=>f.displacement(i,o),options);
export const cinematicGlow=(options:Options<NativeBuiltinFilters['cinematicGlow']>={}):ImageEffect=>unary('cinematicGlow',createNativeBuiltinEffects,(f,i,o)=>f.cinematicGlow(i,o),options);
export function glassRelief(reference:ImageInput,options:NonNullable<Parameters<NativeStylizeFilters['glassRelief']>[2]>={}):ImageEffect{const effect:ImageEffect=async(image,frame)=>{const other=await frame.input(reference);return frame.process(createNativeStylizeEffects,image,(source,f)=>f.glassRelief(source,other,options));};Object.defineProperty(effect,'name',{value:'glassRelief'});return withImageSources(effect,reference);}
export function blobbylize(reference:ImageInput,options:NonNullable<Parameters<NativeClosureImageFilters['blobbylize']>[2]>={}):ImageEffect{const effect:ImageEffect=async(image,frame)=>{const other=await frame.input(reference);return frame.process(createNativeClosureImageEffects,image,(source,f)=>f.blobbylize(source,other,options));};Object.defineProperty(effect,'name',{value:'blobbylize'});return withImageSources(effect,reference);}
export function mergeMatte(reference:ImageInput,options:NonNullable<Parameters<NativeRasterFilters['mergeMatte']>[2]>={}):ImageEffect{const effect:ImageEffect=async(image,frame)=>{const other=await frame.input(reference);return frame.process(createNativeRasterEffects,image,(source,f)=>f.mergeMatte(source,other,options));};Object.defineProperty(effect,'name',{value:'mergeMatte'});return withImageSources(effect,reference);}
export function replaceMatte(reference:ImageInput,options:NonNullable<Parameters<NativeRasterFilters['replaceMatte']>[2]>={}):ImageEffect{const effect:ImageEffect=async(image,frame)=>{const other=await frame.input(reference);return frame.process(createNativeRasterEffects,image,(source,f)=>f.replaceMatte(source,other,options));};Object.defineProperty(effect,'name',{value:'replaceMatte'});return withImageSources(effect,reference);}
export function subtractMatte(reference:ImageInput,options:NonNullable<Parameters<NativeRasterFilters['subtractMatte']>[2]>={}):ImageEffect{const effect:ImageEffect=async(image,frame)=>{const other=await frame.input(reference);return frame.process(createNativeRasterEffects,image,(source,f)=>f.subtractMatte(source,other,options));};Object.defineProperty(effect,'name',{value:'subtractMatte'});return withImageSources(effect,reference);}
export function modulate(reference:ImageInput,options:NonNullable<Parameters<NativeRasterFilters['modulate']>[2]>={}):ImageEffect{const effect:ImageEffect=async(image,frame)=>{const other=await frame.input(reference);return frame.process(createNativeRasterEffects,image,(source,f)=>f.modulate(source,other,options));};Object.defineProperty(effect,'name',{value:'modulate'});return withImageSources(effect,reference);}
export function crossfade(reference:ImageInput,options:NonNullable<Parameters<NativeRasterFilters['crossfade']>[2]>={}):ImageEffect{const effect:ImageEffect=async(image,frame)=>{const other=await frame.input(reference);return frame.process(createNativeRasterEffects,image,(source,f)=>f.crossfade(source,other,options));};Object.defineProperty(effect,'name',{value:'crossfade'});return withImageSources(effect,reference);}
export function displaceWithMap(map:ImageInput,options:NonNullable<Parameters<NativePaImageFilters['displaceWithMap']>[2]>):ImageEffect{const effect:ImageEffect=async(image,frame)=>{const field=await frame.input(map);return frame.process(createNativePaImageEffects,image,(source,f)=>f.displaceWithMap(source,field,options));};Object.defineProperty(effect,'name',{value:'displaceWithMap'});return withImageSources(effect,map);}
