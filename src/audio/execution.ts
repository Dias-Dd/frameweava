import type {TVG,StageSpec,StageAdapter,FrameContext,PortValue,StageFrameResult} from '../core/types.ts';
import {EngineError,diagnostic} from '../core/errors.ts';
import {assertInterval,frameInterval,frameToSample,localInterval,type SampleInterval} from './time.ts';
import {assertAudioMetadata,type IntervalRequest} from './contract.ts';
import {assertAudioBlock,isAudioBlock} from './block.ts';
/** The Renderer calls these boundary helpers INSIDE its existing execute loop. No scheduling here. */
export function intervalFrame(tvg:TVG,interval:SampleInterval){assertInterval(interval);const fps=tvg.composition.fps;if(interval.endExclusive>frameToSample(tvg.composition.durationInFrames,interval.sampleRate,fps))throw new EngineError('E_AUDIO_PROJECT_RANGE','Sample interval exceeds the finite project range');return Number(((BigInt(interval.start)+1n)*BigInt(fps.num)-1n)/(BigInt(interval.sampleRate)*BigInt(fps.den)));}
export function stageAudioRequest(tvg:TVG,stage:StageSpec,frame:number,interval?:SampleInterval):IntervalRequest|null|undefined {
  if(stage.engine!=='audio')return undefined;assertAudioMetadata(stage.audio);const fps=tvg.composition.fps,global=interval??frameInterval(frame,stage.audio.sampleRate,fps);
  if(global.sampleRate!==stage.audio.sampleRate)throw new EngineError('E_AUDIO_RATE','Stage/sample request rate mismatch; explicit resampling is required',{stageId:stage.id});
  if(interval&&(global.start<frameToSample(stage.time.start,global.sampleRate,fps)||global.endExclusive>frameToSample(stage.time.start+stage.time.duration,global.sampleRate,fps)))throw new EngineError('E_AUDIO_STAGE_RANGE','Sample interval exceeds the Stage active range',{stageId:stage.id});
  let local=localInterval(global,stage.time,fps),mapped=global;
  if(!interval){const start=Math.max(0,local.start),end=Math.min(stage.audio.durationSamples,local.endExclusive);if(end<=start)return null;const shift=start-local.start;mapped={...global,start:global.start+shift,endExclusive:global.start+shift+end-start};local={...local,start,endExclusive:end};}
  if(local.start<0||local.endExclusive>stage.audio.durationSamples)throw new EngineError('E_AUDIO_COVERAGE','Requested source samples exceed declared Audio Stage duration',{stageId:stage.id});
  return {global:mapped,local,fps,seed:tvg.composition.seed};
}
export async function renderStageInterval(adapter:StageAdapter,stage:StageSpec,request:IntervalRequest,inputs:Record<string,PortValue>,props:Record<string,unknown>):Promise<StageFrameResult>{
  try{
  if(adapter.intervalCapability?.schemaVersion!==1||!adapter.evaluateInterval)throw new EngineError('E_AUDIO_CAPABILITY',`Backend '${stage.engine}' does not declare sample-interval execution`,{stageId:stage.id});
  const result=await adapter.evaluateInterval(stage,request,inputs,props);
  for(const [name,type]of Object.entries(stage.outputs))if(type==='audio'){
    const value=result.outputs[name];assertAudioBlock(value);const coverage=result.coverage[name];
    if(value.sampleRate!==request.local.sampleRate||value.startSample!==request.local.start||value.sampleCount!==request.local.endExclusive-request.local.start||value.validRange.start!==0||value.validRange.endExclusive!==value.sampleCount||!coverage||coverage.start!==request.local.start||coverage.endExclusive!==request.local.endExclusive||coverage.sampleRate!==request.local.sampleRate)throw new EngineError('E_AUDIO_COVERAGE',`Stage '${stage.id}.${name}' did not return exact valid sample coverage`,{stageId:stage.id});
    if(stage.audio&&value.channelLayout.name!==stage.audio.layout)throw new EngineError('E_AUDIO_LAYOUT','Returned Audio Stage layout differs from its declaration',{stageId:stage.id});
  }return {outputs:result.outputs,diagnostics:result.diagnostics};
  }catch(e){const issue=diagnostic(e);throw new EngineError(issue.code,issue.message,{stageId:stage.id,details:{interval:request,cause:issue}});}
}
export function audioOutputMatches(value:unknown){if(!isAudioBlock(value))return false;assertAudioBlock(value);return true;}
