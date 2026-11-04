import {type ColorEncoding} from '../../src/media/surface.ts';

import {fail,fields,type ImageEffectOptions} from './parameters.ts';


/** Composite over scene-linear black, retaining PM RGB and setting coverage 1.
 * This does not discard straight Alpha, unpremultiply, or support arbitrary mattes. */
export interface FlattenBlackOptions extends ImageEffectOptions {}
export function resolveFlattenBlack(options:FlattenBlackOptions={}){
 fields(options,['workingColor','format','alpha','maxBufferBytes','signal'],'flattenBlack');
 if(options.signal!==undefined&&!(options.signal instanceof AbortSignal))fail('E_GPU_IMAGE_PARAMETER','signal must be an AbortSignal');
 return {output:{workingColor:options.workingColor,format:options.format,alpha:options.alpha,maxBufferBytes:options.maxBufferBytes},signal:options.signal};
}
export function sameColor(a:ColorEncoding,b:ColorEncoding){return Object.keys({...a,...b}).every(k=>a[k as keyof ColorEncoding]===b[k as keyof ColorEncoding]);}
