import {evaluate} from '../../src/core/animation.ts';
import type {FrameContext,Signal} from '../../src/core/types.ts';

import {fields,fail,type ImageEffectOptions} from './parameters.ts';



/** Linear interpolation of prepared PM RGBA, not Source-over coverage. */
export interface CrossfadeOptions extends Omit<ImageEffectOptions,'alpha'> {mix?:Signal<number>;alpha?:'premultiplied'|'opaque'}
export function resolveCrossfade(options:CrossfadeOptions={},ctx?:FrameContext){
 fields(options,['mix','workingColor','format','alpha','maxBufferBytes','signal'],'crossfade');
 if(options.signal!==undefined&&!(options.signal instanceof AbortSignal))fail('E_GPU_IMAGE_PARAMETER','signal must be an AbortSignal');
 const raw=options.mix===undefined?.5:options.mix;
 if(typeof raw!=='number'&&(!raw||typeof raw!=='object'||Array.isArray(raw)))fail('E_GPU_IMAGE_PARAMETER','mix: number or Signal required');
 if(typeof raw!=='number'&&!ctx)fail('E_GPU_IMAGE_CONTEXT','Mix Signal requires FrameContext');
 const mix=typeof raw==='number'?raw:evaluate(raw,ctx!);
 if(typeof mix!=='number'||!Number.isFinite(mix)||mix<0||mix>1)fail('E_GPU_IMAGE_PARAMETER','mix must be finite in [0,1]');
 return {mix,output:{workingColor:options.workingColor,format:options.format,alpha:options.alpha,maxBufferBytes:options.maxBufferBytes},signal:options.signal};
}
