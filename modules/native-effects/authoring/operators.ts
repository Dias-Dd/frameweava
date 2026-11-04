import {withImageSources} from './runtime.ts';
import type {Signal} from '../../../src/core/types.ts';
import type {GpuPixelImage} from '../../gpu-effects/pixel-types.ts';
import {createNativeProfessionalEffects} from '../extended.ts';
import type {NativeProfessionalFilters} from '../extended.ts';
import {createNativeRasterEffects} from '../raster/filters.ts';
import type {NativeRasterFilters} from '../raster/filters.ts';
import {createNativeOpticalEffects} from '../optics/filters.ts';
import type {NativeOpticalRecipeFilters} from '../optics/filters.ts';
import {createNativeGeometryEffects} from '../geometry/index.ts';
import type {ResizeOptions} from '../geometry/types.ts';
import {createNativeBuiltinEffects,type BuiltinTransform} from '../builtin/filters.ts';
import {createNativeGradingEffects,defineLut,cubeLut} from '../grading/index.ts';
import type {NativeGradingRecipeFilters,LutDefinition,LutOptions} from '../grading/index.ts';
import type {ImageEffect,ImageEffectFactory,ImageFrame,ImageInput} from './types.ts';

type Options<F extends (...args:never[])=>Promise<GpuPixelImage>>=NonNullable<Parameters<F>[1]>;
type P=NativeProfessionalFilters;type R=NativeRasterFilters;type O=NativeOpticalRecipeFilters;type G=NativeGradingRecipeFilters;
function unary<F,T>(name:string,factory:ImageEffectFactory<F>,invoke:(fx:F,image:GpuPixelImage,options:T)=>Promise<GpuPixelImage>,options:T):ImageEffect {
  const operation:ImageEffect=(image,frame)=>frame.process(factory,image,(source,fx)=>invoke(fx,source,options));
  Object.defineProperty(operation,'name',{value:name});return operation;
}
function professional<T>(name:string,invoke:(fx:P,image:GpuPixelImage,options:T)=>Promise<GpuPixelImage>,options:T){return unary(name,createNativeProfessionalEffects,invoke,options);}
function raster<T>(name:string,invoke:(fx:R,image:GpuPixelImage,options:T)=>Promise<GpuPixelImage>,options:T){return unary(name,createNativeRasterEffects,invoke,options);}
function optical<T>(name:string,invoke:(fx:O,image:GpuPixelImage,options:T)=>Promise<GpuPixelImage>,options:T){return unary(name,createNativeOpticalEffects,invoke,options);}
function grading<T>(name:string,invoke:(fx:G,image:GpuPixelImage,options:T)=>Promise<GpuPixelImage>,options:T){return unary(name,createNativeGradingEffects,invoke,options);}
const input=(value:ImageInput,frame:ImageFrame)=>frame.input(value);
function signal(value:Signal<number>|object):value is Signal<number>{if(typeof value==='number')return true;if(!value||typeof value!=='object'||Array.isArray(value))return false;const keys=Object.keys(value);return keys.length===1&&('$keyframes'in value||'$spring'in value)||keys.length===2&&'$expr'in value&&'args'in value;}

/** Gaussian sigma in physical image pixels. Full existing raster options stay available. */
export const blur=(options:Signal<number>|Options<R['blur']>={}):ImageEffect=>raster('blur',(f,i,o)=>f.blur(i,o),signal(options)?{radius:options}:options);
export const glow=(options:Options<R['glow']>={}):ImageEffect=>raster('glow',(f,i,o)=>f.glow(i,o),options);
/** Scene-linear exposure stops; no gamma/display conversion is implied. */
export const exposure=(options:Signal<number>|Options<R['exposure']>={}):ImageEffect=>raster('exposure',(f,i,o)=>f.exposure(i,o),signal(options)?{stops:options}:options);
export const invert=(options:Options<R['invert']>={}):ImageEffect=>raster('invert',(f,i,o)=>f.invert(i,o),options);
export const dropShadow=(options:Options<R['dropShadow']>={}):ImageEffect=>raster('dropShadow',(f,i,o)=>f.dropShadow(i,o),options);
export const feather=(options:Options<R['feather']>={}):ImageEffect=>raster('feather',(f,i,o)=>f.feather(i,o),options);
export const reframe=(options:Options<R['reframe']>={}):ImageEffect=>raster('reframe',(f,i,o)=>f.reframe(i,o),options);
/** Missing output dimensions come from the Stage; method/antialias/budgets are
 * the original professional resampler options. No CPU resize is introduced. */
export function resize(options:Omit<ResizeOptions,'width'|'height'>&Partial<Pick<ResizeOptions,'width'|'height'>>={}):ImageEffect{const operation:ImageEffect=async(image,frame)=>frame.process(createNativeGeometryEffects,image,(source,f)=>f.resample(source,{...options,width:options.width??frame.init.width,height:options.height??frame.init.height}));Object.defineProperty(operation,'name',{value:'resize'});return operation;}
/** Rotation in degrees, scale as a ratio, about the image centre. */
export const transform=(options:BuiltinTransform={}):ImageEffect=>unary('transform',createNativeBuiltinEffects,(f,i,o)=>f.transform(i,o),options);
export const levels=(options:Options<P['levels']>={}):ImageEffect=>professional('levels',(f,i,o)=>f.levels(i,o),options);
export const curves=(options:Options<P['curves']>={}):ImageEffect=>professional('curves',(f,i,o)=>f.curves(i,o),options);
export const channelMix=(options:Options<P['channelMix']>={}):ImageEffect=>professional('channelMix',(f,i,o)=>f.channelMix(i,o),options);
export const unsharpMask=(options:Options<P['unsharpMask']>={}):ImageEffect=>professional('unsharpMask',(f,i,o)=>f.unsharpMask(i,o),options);
export const sharpen=(options:Options<P['sharpen']>={}):ImageEffect=>professional('sharpen',(f,i,o)=>f.sharpen(i,o),options);
export const chromaKey=(options:Options<P['chromaKey']>={}):ImageEffect=>professional('chromaKey',(f,i,o)=>f.chromaKey(i,o),options);
export const lumaKey=(options:Options<P['lumaKey']>={}):ImageEffect=>professional('lumaKey',(f,i,o)=>f.lumaKey(i,o),options);
export const despill=(options:Options<P['despill']>={}):ImageEffect=>professional('despill',(f,i,o)=>f.despill(i,o),options);
export const vignette=(options:Options<P['vignette']>={}):ImageEffect=>professional('vignette',(f,i,o)=>f.vignette(i,o),options);
export const filmGrain=(options:Options<P['filmGrain']>={}):ImageEffect=>professional('filmGrain',(f,i,o)=>f.filmGrain(i,o),options);
export const colorBalance=(options:Options<P['colorBalance']>={}):ImageEffect=>professional('colorBalance',(f,i,o)=>f.colorBalance(i,o),options);
export const brightnessContrast=(options:Options<P['brightnessContrast']>={}):ImageEffect=>professional('brightnessContrast',(f,i,o)=>f.brightnessContrast(i,o),options);
export const hueSaturation=(options:Options<P['hueSaturation']>={}):ImageEffect=>professional('hueSaturation',(f,i,o)=>f.hueSaturation(i,o),options);
export const vibrance=(options:Options<P['vibrance']>={}):ImageEffect=>professional('vibrance',(f,i,o)=>f.vibrance(i,o),options);
export const tint=(options:Options<P['tint']>={}):ImageEffect=>professional('tint',(f,i,o)=>f.tint(i,o),options);
export const blackAndWhite=(options:Options<P['blackAndWhite']>={}):ImageEffect=>professional('blackAndWhite',(f,i,o)=>f.blackAndWhite(i,o),options);
export const pixelate=(options:Options<P['pixelate']>={}):ImageEffect=>professional('pixelate',(f,i,o)=>f.pixelate(i,o),options);
export const posterize=(options:Options<P['posterize']>={}):ImageEffect=>professional('posterize',(f,i,o)=>f.posterize(i,o),options);
export const findEdges=(options:Options<P['findEdges']>={}):ImageEffect=>professional('findEdges',(f,i,o)=>f.findEdges(i,o),options);
export const boxBlur=(options:Options<P['boxBlur']>={}):ImageEffect=>professional('boxBlur',(f,i,o)=>f.boxBlur(i,o),options);
export const directionalBlur=(options:Options<P['directionalBlur']>={}):ImageEffect=>professional('directionalBlur',(f,i,o)=>f.directionalBlur(i,o),options);
export const bilateralBlur=(options:Options<P['bilateralBlur']>={}):ImageEffect=>professional('bilateralBlur',(f,i,o)=>f.bilateralBlur(i,o),options);
export const autoLevels=(options:Options<P['autoLevels']>={}):ImageEffect=>professional('autoLevels',(f,i,o)=>f.autoLevels(i,o),options);
export const autoContrast=(options:Options<P['autoContrast']>={}):ImageEffect=>professional('autoContrast',(f,i,o)=>f.autoContrast(i,o),options);
export const autoColor=(options:Options<P['autoColor']>={}):ImageEffect=>professional('autoColor',(f,i,o)=>f.autoColor(i,o),options);
export const erodeImage=(options:Options<P['erodeImage']>={}):ImageEffect=>professional('erodeImage',(f,i,o)=>f.erodeImage(i,o),options);
export const dilateImage=(options:Options<P['dilateImage']>={}):ImageEffect=>professional('dilateImage',(f,i,o)=>f.dilateImage(i,o),options);

export const bloom=(options:Options<O['bloomPyramid']>={}):ImageEffect=>optical('bloom',(f,i,o)=>f.bloomPyramid(i,o),options);
export const lensFlare=(options:Options<O['lensFlare']>={}):ImageEffect=>optical('lensFlare',(f,i,o)=>f.lensFlare(i,o),options);
export const lightRays=(options:Options<O['lightRays']>={}):ImageEffect=>optical('lightRays',(f,i,o)=>f.lightRays(i,o),options);
export const halation=(options:Options<O['halation']>={}):ImageEffect=>optical('halation',(f,i,o)=>f.halation(i,o),options);
export const softFocus=(options:Options<O['softFocus']>={}):ImageEffect=>optical('softFocus',(f,i,o)=>f.softFocus(i,o),options);
export const chromaticAberration=(options:Options<O['chromaticAberration']>={}):ImageEffect=>optical('chromaticAberration',(f,i,o)=>f.chromaticAberration(i,o),options);
export const whiteBalance=(options:Options<G['whiteBalance']>={}):ImageEffect=>grading('whiteBalance',(f,i,o)=>f.whiteBalance(i,o),options);
export const colorWheels=(options:Options<G['colorWheels']>={}):ImageEffect=>grading('colorWheels',(f,i,o)=>f.colorWheels(i,o),options);
export const cdl=(options:Options<G['cdl']>={}):ImageEffect=>grading('cdl',(f,i,o)=>f.cdl(i,o),options);
export const liftGammaGain=(options:Options<G['liftGammaGain']>={}):ImageEffect=>grading('liftGammaGain',(f,i,o)=>f.liftGammaGain(i,o),options);
export const lut1D=(table:LutDefinition,options:LutOptions={}):ImageEffect=>grading('lut1D',(f,i,o)=>f.lut1D(i,table,o),options);
export const lut3D=(table:LutDefinition,options:LutOptions={}):ImageEffect=>grading('lut3D',(f,i,o)=>f.lut3D(i,table,o),options);
/** Source can be a borrowed same-frame image or an explicit imageResource. */
export function over(foreground:ImageInput,options:NonNullable<Parameters<R['over']>[2]>={}):ImageEffect{const operation:ImageEffect=async(image,frame)=>{const front=await input(foreground,frame);return frame.process(createNativeRasterEffects,image,(background,f)=>f.over(front,background,options));};Object.defineProperty(operation,'name',{value:'over'});return withImageSources(operation,foreground);}
export function applyMatte(matte:ImageInput,options:NonNullable<Parameters<P['applyMatte']>[2]>={}):ImageEffect{const operation:ImageEffect=async(image,frame)=>{const mask=await input(matte,frame);return frame.process(createNativeProfessionalEffects,image,(source,f)=>f.applyMatte(source,mask,options));};Object.defineProperty(operation,'name',{value:'applyMatte'});return withImageSources(operation,matte);}
export {defineLut,cubeLut};
