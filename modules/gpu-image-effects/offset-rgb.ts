import {evaluate} from '../../src/core/animation.ts';
import type {FrameContext,Signal} from '../../src/core/types.ts';


import {fields,fail,type ImageEffectOptions} from './parameters.ts';




/** Scene-linear RGB offset, preserving logical Alpha and its representation.
 * Straight/opaque adds offset; PM adds offset*Alpha. Not grading Lift/gamma. */
export interface OffsetRgbOptions extends Omit<ImageEffectOptions,'alpha'> {offset?:readonly [Signal<number>,Signal<number>,Signal<number>]}
export function resolveOffsetRgb(options:OffsetRgbOptions={},ctx?:FrameContext){
 fields(options,['offset','workingColor','format','maxBufferBytes','signal'],'offsetRGB');
 if(options.signal!==undefined&&!(options.signal instanceof AbortSignal))fail('E_GPU_IMAGE_PARAMETER','signal must be an AbortSignal');
 const source=options.offset===undefined?[0,0,0] as const:options.offset;
 if(!Array.isArray(source)||source.length!==3)fail('E_GPU_IMAGE_PARAMETER','offsetRGB.offset: three number/Signal leaves required');
 const leaf=(raw:Signal<number>,index:number)=>{
  if(typeof raw!=='number'&&(!raw||typeof raw!=='object'||Array.isArray(raw)))fail('E_GPU_IMAGE_PARAMETER',`offsetRGB.offset[${index}]: number or Signal required`);
  if(typeof raw!=='number'&&!ctx)fail('E_GPU_IMAGE_CONTEXT','Offset Signal requires FrameContext');
  const value=typeof raw==='number'?raw:evaluate(raw,ctx!);
  if(typeof value!=='number'||!Number.isFinite(value))fail('E_GPU_IMAGE_PARAMETER',`offsetRGB.offset[${index}]: finite number required`);
  const v=Math.fround(value);if(!Number.isFinite(v))fail('E_MEDIA_RANGE','RGB offset exceeds finite Float32');if(v!==0&&Math.abs(v)<2**-126)fail('E_GPU_IMAGE_UNSUPPORTED','RGB offset must be zero or normal Float32');return v;
 };
 const offset:readonly [number,number,number]=[leaf(source[0],0),leaf(source[1],1),leaf(source[2],2)];
 return {offset,output:{workingColor:options.workingColor,format:options.format,maxBufferBytes:options.maxBufferBytes},signal:options.signal};
}
