import {evaluate} from '../../src/core/animation.ts';
import type {FrameContext,Signal} from '../../src/core/types.ts';
import {type ProfessionalSurface} from '../../src/media/surface.ts';


import {fail,fields,type ImageEffectOptions} from './parameters.ts';

/** One integer raster-space operation: crop/pad, optionally mirror the result.
 * x/y use source physical pixels; flips act inside the requested output rectangle.
 * There is no rescale, subpixel filtering, arbitrary rotation or perspective. */
export interface ReframeOptions extends ImageEffectOptions {
 x?:Signal<number>;y?:Signal<number>;width?:Signal<number>;height?:Signal<number>;
 flipX?:Signal<boolean>;flipY?:Signal<boolean>;
}
export interface ResolvedReframe {x:number;y:number;width:number;height:number;flipX:boolean;flipY:boolean}
export function resolveReframe(input:Pick<ProfessionalSurface,'width'|'height'>,options:ReframeOptions={},context?:FrameContext){
 fields(options,['x','y','width','height','flipX','flipY','workingColor','format','alpha','maxBufferBytes','signal'],'reframe');
 if(options.signal!==undefined&&!(options.signal instanceof AbortSignal))fail('E_GPU_IMAGE_PARAMETER','signal must be an AbortSignal');
 const value=<T extends number|boolean>(raw:Signal<T>|undefined,fallback:T,name:string):T=>{
  if(raw!==undefined&&typeof raw!=='number'&&typeof raw!=='boolean'&&!context)fail('E_GPU_IMAGE_CONTEXT',`${name}: Signal requires FrameContext`);
  const result=raw===undefined?fallback:typeof raw==='number'||typeof raw==='boolean'?raw:evaluate(raw,context!);
  if(typeof result!==typeof fallback||typeof result==='number'&&!Number.isSafeInteger(result))fail('E_GPU_IMAGE_PARAMETER',`${name}: ${typeof fallback==='number'?'safe integer pixels':'boolean'} required`);
  return result as T;
 };
 const resolved:ResolvedReframe={x:value<number>(options.x,0,'x'),y:value<number>(options.y,0,'y'),width:value<number>(options.width,input.width,'width'),height:value<number>(options.height,input.height,'height'),flipX:value<boolean>(options.flipX,false,'flipX'),flipY:value<boolean>(options.flipY,false,'flipY')};
 if(resolved.width<1||resolved.height<1||!Number.isSafeInteger(resolved.x+resolved.width)||!Number.isSafeInteger(resolved.y+resolved.height))fail('E_GPU_IMAGE_PARAMETER','Positive dimensions and safe integer rectangle endpoints required');
 return {resolved,output:{workingColor:options.workingColor,format:options.format,alpha:options.alpha,maxBufferBytes:options.maxBufferBytes},signal:options.signal};
}
