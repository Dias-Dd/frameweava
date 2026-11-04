

import {fields,fail,type ImageEffectOptions} from './parameters.ts';



/** Raw dimensionless per-channel RGB gains in working-colour channel order.
 * Gain Alpha is ignored; input logical Alpha is preserved. No mask/blend. */
export interface ModulateOptions extends ImageEffectOptions {}
export function resolveModulate(options:ModulateOptions={}){
 fields(options,['workingColor','format','alpha','maxBufferBytes','signal'],'modulate');
 if(options.signal!==undefined&&!(options.signal instanceof AbortSignal))fail('E_GPU_IMAGE_PARAMETER','signal must be an AbortSignal');
 return {output:{workingColor:options.workingColor,format:options.format,alpha:options.alpha,maxBufferBytes:options.maxBufferBytes},signal:options.signal};
}
