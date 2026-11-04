

import {fields,fail,type ImageEffectOptions} from './parameters.ts';



/** Scene-linear RGB negative about working white=1. Alpha is never inverted.
 * PM: RGB'=A-RGB; straight/opaque: RGB'=1-RGB. No clamping. */
export interface InvertOptions extends ImageEffectOptions {}
export function resolveInvert(options:InvertOptions={}){
 fields(options,['workingColor','format','alpha','maxBufferBytes','signal'],'invert');
 if(options.signal!==undefined&&!(options.signal instanceof AbortSignal))fail('E_GPU_IMAGE_PARAMETER','signal must be an AbortSignal');
 return {output:{workingColor:options.workingColor,format:options.format,alpha:options.alpha,maxBufferBytes:options.maxBufferBytes},signal:options.signal};
}
