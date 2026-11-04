import type {TrackData,TrackReader} from '../../modules/graphics-contracts/track.ts';
import type {AnalysisBatchQuery} from './types.ts';
import {toolError} from './paths.ts';
import {diagnostic,EngineError} from '../core/errors.ts';

export const ANALYSIS_BATCH_LIMITS={times:1024,responseBytes:2*1024*1024} as const;
export async function sampleBatch(authenticate:()=>Promise<{data:TrackData;reader:TrackReader}>,id:string,query:AnalysisBatchQuery,options:{signal?:AbortSignal}={}){
  const check=()=>{if(options.signal?.aborted)toolError('E_CANCELLED','Batch query cancelled');};check();
  if(!query||!Array.isArray(query.times)||query.times.length<1||query.times.length>ANALYSIS_BATCH_LIMITS.times||Object.keys(query.times).length!==query.times.length)toolError('E_ARGUMENT','Batch requires a dense array of 1..1024 source-media times');
  // Copy request before the first await: caller mutation cannot change order, duplicates or limits.
  const times=[...query.times],mode=query.mode,maxGapSeconds=query.maxGapSeconds;
  const {data,reader}=await authenticate();check();
  const records=times.map((time,index)=>{check();try{const result=reader.query(time,{mode,maxGapSeconds});return {index,sourceTimeSeconds:time,timestampUs:Math.round(time*1e6),observation:result.valid?(result.interpolated?'interpolated':'observed'):'missing',result};}catch(error){const d=diagnostic(error);throw new EngineError(d.code,d.message,{details:{...(d.details&&typeof d.details==='object'?d.details:{}),batchIndex:index}});}});
  const output={artifactId:id,artifactType:data.schemaVersion,records,count:records.length,queryRule:{mode:mode??'linear',maxGapSeconds:maxGapSeconds??2/data.config.sampleRate},integrity:{verified:true,scope:'full-c3-this-call'},diagnostics:[]};
  if(Buffer.byteLength(JSON.stringify(output))>ANALYSIS_BATCH_LIMITS.responseBytes)toolError('E_ANALYSIS_QUERY_LIMIT','Batch response exceeds 2 MiB');check();return output;
}
