import {evaluate} from '../../src/core/animation.ts';
import type {FrameContext,Signal} from '../../src/core/types.ts';


import {fields,fail,type ImageEffectOptions} from './parameters.ts';



/** Scene-linear RGB gain = Float32(2**stops), preserving logical coverage.
 * Neither gamma nor display tone mapping; no opacity/blend/backend controls. */
export interface ExposureOptions extends ImageEffectOptions {stops?:Signal<number>}
export function resolveExposure(options:ExposureOptions={},ctx?:FrameContext){
 fields(options,['stops','workingColor','format','alpha','maxBufferBytes','signal'],'exposure');
 if(options.signal!==undefined&&!(options.signal instanceof AbortSignal))fail('E_GPU_IMAGE_PARAMETER','signal must be an AbortSignal');
 const raw=options.stops===undefined?0:options.stops;
 if(typeof raw!=='number'&&(!raw||typeof raw!=='object'||Array.isArray(raw)))fail('E_GPU_IMAGE_PARAMETER','stops: finite number or Signal required');
 if(typeof raw!=='number'&&!ctx)fail('E_GPU_IMAGE_CONTEXT','Exposure Signal requires FrameContext');
 const stops=typeof raw==='number'?raw:evaluate(raw,ctx!);
 if(typeof stops!=='number'||!Number.isFinite(stops))fail('E_GPU_IMAGE_PARAMETER','stops: finite number required');
 const gain=Math.fround(2**stops);
 if(!Number.isFinite(gain)||gain<2**-126)fail('E_GPU_IMAGE_UNSUPPORTED','Exposure gain must be positive normal finite Float32');
 return {gain,output:{workingColor:options.workingColor,format:options.format,alpha:options.alpha,maxBufferBytes:options.maxBufferBytes},signal:options.signal};
}
