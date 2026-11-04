import {EngineError} from '../../../src/core/errors.ts';
import {createNativeClosureEffects} from '../closure-filters/index.ts';
import type {NativeClosureFilters,OcioDefinition,OcioOptions} from '../closure-filters/types.ts';
import {validateOcio} from '../closure-filters/ocio/runtime-v2.ts';
import {defineLut} from '../grading/index.ts';import type {CubeLut} from '../../../src/media/color.ts';
import type {LutDefinition,LutEncoding} from '../grading/types.ts';
import type {GpuPixelImage} from '../../gpu-effects/pixel-types.ts';
import type {ImageEffect,ImageInput} from './types.ts';
import {prepareImageEffects,withPreparedEffects} from './prepared.ts';import {authoringError,withImageSources} from './runtime.ts';
import {closureEffects as closure} from './closure-asset.ts';

// An immutable declaration, NOT a process-global processor. Each Stage creates
// its own async original module exactly once using its admitted GPU init.
type Options<F extends (...args:never[])=>Promise<GpuPixelImage>>=NonNullable<Parameters<F>[1]>;
function unary<T>(name:string,invoke:(fx:NativeClosureFilters,image:GpuPixelImage,options:T)=>Promise<GpuPixelImage>,options:T):ImageEffect {return withPreparedEffects(closure,(image,f)=>invoke(f,image,options),name);}

export const crossBlur=(options:Options<NativeClosureFilters['crossBlur']>={}):ImageEffect=>unary('crossBlur',(f,i,o)=>f.crossBlur(i,o),options);
export const fastRadialBlur=(options:Options<NativeClosureFilters['fastRadialBlur']>={}):ImageEffect=>unary('fastRadialBlur',(f,i,o)=>f.fastRadialBlur(i,o),options);
export const motionDeblur=(options:Options<NativeClosureFilters['motionDeblur']>):ImageEffect=>unary('motionDeblur',(f,i,o)=>f.motionDeblur(i,o),options);
export const colorNeutralize=(options:Options<NativeClosureFilters['colorNeutralize']>={}):ImageEffect=>unary('colorNeutralize',(f,i,o)=>f.colorNeutralize(i,o),options);
export const colorOffsetCycle=(options:Options<NativeClosureFilters['colorOffsetCycle']>={}):ImageEffect=>unary('colorOffsetCycle',(f,i,o)=>f.colorOffsetCycle(i,o),options);
export const colorama=(options:Options<NativeClosureFilters['colorama']>):ImageEffect=>unary('colorama',(f,i,o)=>f.colorama(i,o),options);
export const noiseAlpha=(options:Options<NativeClosureFilters['noiseAlpha']>={}):ImageEffect=>unary('noiseAlpha',(f,i,o)=>f.noiseAlpha(i,o),options);
export const noiseHls=(options:Options<NativeClosureFilters['noiseHls']>={}):ImageEffect=>unary('noiseHls',(f,i,o)=>f.noiseHls(i,o),options);
export const lightBurst=(options:Options<NativeClosureFilters['lightBurst']>={}):ImageEffect=>unary('lightBurst',(f,i,o)=>f.lightBurst(i,o),options);
export const lightSweep=(options:Options<NativeClosureFilters['lightSweep']>={}):ImageEffect=>unary('lightSweep',(f,i,o)=>f.lightSweep(i,o),options);
export const eyedropperFill=(options:Options<NativeClosureFilters['eyedropperFill']>={}):ImageEffect=>unary('eyedropperFill',(f,i,o)=>f.eyedropperFill(i,o),options);
function reference<T>(name:string,value:ImageInput,invoke:(fx:NativeClosureFilters,image:GpuPixelImage,reference:GpuPixelImage,options:T)=>Promise<GpuPixelImage>,options:T):ImageEffect {const effect=withPreparedEffects(closure,async(image,f,frame)=>invoke(f,image,await frame.input(value),options),name);return withImageSources(effect,value);}
export const channelCalculations=(value:ImageInput,options:NonNullable<Parameters<NativeClosureFilters['channelCalculations']>[2]>={}):ImageEffect=>reference('channelCalculations',value,(f,i,r,o)=>f.channelCalculations(i,r,o),options);
export const colorMatch=(value:ImageInput,options:NonNullable<Parameters<NativeClosureFilters['colorMatch']>[2]>={}):ImageEffect=>reference('colorMatch',value,(f,i,r,o)=>f.colorMatch(i,r,o),options);
export const colorStabilize=(value:ImageInput,options:NonNullable<Parameters<NativeClosureFilters['colorStabilize']>[2]>={}):ImageEffect=>reference('colorStabilize',value,(f,i,r,o)=>f.colorStabilize(i,r,o),options);
export const matchGrain=(value:ImageInput,options:NonNullable<Parameters<NativeClosureFilters['matchGrain']>[2]>={}):ImageEffect=>reference('matchGrain',value,(f,i,r,o)=>f.matchGrain(i,r,o),options);

/** JSON input boundary; reuse the original complete OCIO validator. Schema
 * eligibility is not trust/runtime verification. Init still checks content seals. */
export function ocioDefinition(value:unknown):OcioDefinition {try{validateOcio(value as OcioDefinition);}catch(error){if(error instanceof EngineError)throw error;authoringError('ocioDefinition','expected the existing sealed Native OCIO v1/v2 data');}return value as OcioDefinition;}
function ocio(name:'ocioColorSpaceTransform'|'ocioFileTransform'|'ocioLookTransform',definition:OcioDefinition,options:OcioOptions):ImageEffect {const processor=prepareImageEffects(init=>createNativeClosureEffects(init,{ocioProcessors:[definition]}));return withPreparedEffects(processor,(image,f)=>f[name](image,definition,options),name);}
export const ocioColorSpaceTransform=(definition:OcioDefinition,options:OcioOptions={}):ImageEffect=>ocio('ocioColorSpaceTransform',definition,options);
export const ocioFileTransform=(definition:OcioDefinition,options:OcioOptions={}):ImageEffect=>ocio('ocioFileTransform',definition,options);
export const ocioLookTransform=(definition:OcioDefinition,options:OcioOptions={}):ImageEffect=>ocio('ocioLookTransform',definition,options);

/** Detached JSON table re-enters the ONE original LUT validation identity.
 * Encoding is mandatory data, never inferred from a filename. */
export function lutDefinition(value:unknown):LutDefinition {
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['kind','size','domainMin','domainMax','values','inputEncoding','outputEncoding'].includes(k)))authoringError('lutDefinition','expected the existing complete LUT table and explicit input/output encoding');
  const {inputEncoding,outputEncoding,...table}=value as LutDefinition;
  return defineLut(table as CubeLut,{inputEncoding:inputEncoding as LutEncoding,outputEncoding:outputEncoding as LutEncoding});
}
