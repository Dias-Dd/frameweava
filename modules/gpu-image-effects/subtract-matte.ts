
import {fields,fail,type ImageEffectOptions} from './parameters.ts';



/** Directed coverage difference A*(1-B), canonical black RGB. */
export interface SubtractMatteOptions extends ImageEffectOptions {}
export function resolveSubtractMatte(options:SubtractMatteOptions={}){
 fields(options,['workingColor','format','alpha','maxBufferBytes','signal'],'subtractMatte');
 if(options.signal!==undefined&&!(options.signal instanceof AbortSignal))fail('E_GPU_IMAGE_PARAMETER','signal must be an AbortSignal');
 return {output:{workingColor:options.workingColor,format:options.format,alpha:options.alpha,maxBufferBytes:options.maxBufferBytes},signal:options.signal};
}
