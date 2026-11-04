// SPDX-License-Identifier: Apache-2.0
// Shared original glyph-on-path sample/boundary rules; no new arc-length algorithm.
import {EngineError} from '../../../src/core/errors.ts';
import type {createCurveSampler,CurveSample} from './curve-sampler.ts';
export type GlyphPathReader=Pick<Awaited<ReturnType<typeof createCurveSampler>>,'coordinates'|'metrics'|'sampleBatch'>;
export interface GlyphPathSampleOptions {contour?:number;overflow?:'error'|'clip'|'wrap';side?:'incoming'|'outgoing';signal?:AbortSignal}
export async function sampleGlyphDistances(curve:GlyphPathReader,distances:readonly number[],options:GlyphPathSampleOptions={}):Promise<readonly {sample:CurveSample;clipped:boolean;distance:number}[]>{
 function fail(code:string,message:string):never{throw new EngineError(code,message);}if(options.signal?.aborted)fail('E_PA_TEXT_PATH_CANCELLED','Glyph path placement cancelled');
 const contour=options.contour??(curve.metrics.contours.length===1?0:undefined),overflow=options.overflow??'error';if(!['error','clip','wrap'].includes(overflow))fail('E_PA_TEXT_PATH_PARAMETER','Known overflow rules required');
 if(contour===undefined||!Number.isSafeInteger(contour)||contour<0||contour>=curve.metrics.contours.length)fail('E_PA_TEXT_PATH_CONTOUR','Choose one existing baseline contour');const metric=curve.metrics.contours[contour];if(overflow==='wrap'&&!metric.closed)fail('E_PA_TEXT_PATH_CLOSURE','Wrap requires a closed baseline');
 if(distances.some(d=>!Number.isFinite(d)))fail('E_PA_TEXT_PATH_PARAMETER','Finite original physical distances required');if(distances.length&&metric.length<=0)fail('E_PA_TEXT_PATH_DEGENERATE','Positive baseline length required');
 if(overflow==='error'&&distances.some(d=>d<0||d>metric.length))fail('E_PA_TEXT_PATH_RANGE','Glyph center exceeds baseline; select clip or closed wrap explicitly');
 const result=await curve.sampleBatch(distances,{contour,boundary:overflow==='clip'?'clamp':overflow==='wrap'?'wrap':'error',side:options.side,signal:options.signal});if(options.signal?.aborted)fail('E_PA_TEXT_PATH_CANCELLED','Glyph path placement cancelled');if(result.length!==distances.length)fail('E_PA_TEXT_PATH_OUTPUT','Baseline reader returned an incomplete sample batch');
 return result.map((sample,i)=>({sample,distance:distances[i],clipped:overflow==='clip'&&(distances[i]<0||distances[i]>metric.length)}));
}
