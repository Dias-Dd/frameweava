import type {NativeStageInit} from '../native-gpu/authoring.ts';
import {createProfessionalFilters,type ProfessionalFilters} from '../gpu-image-effects/resident/filters.ts';
import {createNativeRecipeProcessor} from './images.ts';
import {EngineError} from '../../src/core/errors.ts';
export const unavailableNativeImageMethods=[] as const;
export type NativeProfessionalFilters=Omit<ProfessionalFilters,typeof unavailableNativeImageMethods[number]>;
/** Reuse the original WGSL/compute statistics on the admitted Native owner.
 * importImage is an explicit CPU input boundary, not an effect fallback. The
 * existing owner enforces its upload budget; declared assets use importResource. */
export function createNativeProfessionalEffects(init:Pick<NativeStageInit,'gpu'>){
 return createNativeRecipeProcessor<NativeProfessionalFilters>(init,(scope,context,track,signal)=>{
  if(typeof scope.imageToBuffer!=='function')throw new EngineError('E_NATIVE_EFFECTS_CAPABILITY','Automatic colour requires the admitted Native image-data v1 view; CPU readback fallback is not available');
  return createProfessionalFilters(scope,context,track,signal);
 });
}
export const additionalNativeEffectNames=[
 'channelMix','levels','curves','unsharpMask','lumaKey','chromaKey','despill',
 'extractMatte','morphology','featherMatte','matteLevels','applyMatte',
 'boxBlur','directionalBlur','radialBlur','zoomBlur','channelBlur','compoundBlur',
 'sharpen','convolve3x3','emboss','colorEmboss','findEdges','posterize','threshold','thresholdRGB',
 'erodeImage','dilateImage','hueSaturation','colorize','vibrance','photoFilter','gammaPedestalGain','exposure',
 'leaveColor','changeColor','changeToColor','channelArithmetic','setChannels','shiftChannels','removeColorMatting',
 'solidComposite','noise','orderedDither','checkerboard','linearGradient','radialGradient','fourColorGradient','gradientMap',
 'shadowHighlight','selectiveColor','broadcastColors','videoLimiter','median','dustAndScratches','bilateralBlur','smartBlur',
 'autoLevels','autoContrast','autoColor','equalize',
] as const satisfies readonly (keyof NativeProfessionalFilters)[];
