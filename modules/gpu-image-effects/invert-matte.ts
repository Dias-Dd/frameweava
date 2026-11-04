
import {fields,fail,type ImageEffectOptions} from './parameters.ts';


/** Coverage complement, canonical RGB=0, Alpha=Float32(1-sourceAlpha).
 * RGB/colour/association of the mask are not interpreted as coverage. */
export interface InvertMatteOptions extends ImageEffectOptions {}
export function resolveInvertMatte(options:InvertMatteOptions={}){
 fields(options,['workingColor','format','alpha','maxBufferBytes','signal'],'invertMatte');
 if(options.signal!==undefined&&!(options.signal instanceof AbortSignal))fail('E_GPU_IMAGE_PARAMETER','signal must be an AbortSignal');
 return {output:{workingColor:options.workingColor,format:options.format,alpha:options.alpha,maxBufferBytes:options.maxBufferBytes},signal:options.signal};
}
