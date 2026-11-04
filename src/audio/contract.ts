import type {Diagnostic,FrameContext,PortValue,Rational} from '../core/types.ts';
import {fields,integer,assertSampleRate,channelLayout,audioFail,type AudioBlockV1,type AudioSampleRate,type AudioLayout} from './block.ts';
import type {SampleInterval} from './time.ts';
export interface AudioStageMetadata {
  schemaVersion:1;sampleRate:AudioSampleRate;layout:AudioLayout;durationSamples:number;
  seek:'stateless';lookbehindSamples:0;lookaheadSamples:0;latencySamples:0;tailSamples:0;
}
export interface IntervalRequest {global:SampleInterval;local:SampleInterval;fps:Rational;seed:number}
/** Source coordinates are absolute in the requested output sample rate, half-open.
 * Conversion must be chosen explicitly; no implicit time stretching or silence padding. */
export interface AudioResourceRequest {
  resourceId:string;stream:number;interval:SampleInterval;layout:AudioLayout;
  conversion:{sampleRate:'reject'|'resample';layout:'reject'|'remix'};
}
export interface AudioResourceInfo {
  resourceId:string;stream:number;sampleRate:number;channels:number;layout?:AudioLayout;
  /** Exact for admitted PCM WAV; compressed/container duration is not an exact sample count. */
  sampleCount?:number;decoder:'wav-pcm'|'ffmpeg';
}
export interface AudioResourceService {
  read(request:AudioResourceRequest):Promise<AudioBlockV1>;
  info(resourceId:string,stream:number):Promise<AudioResourceInfo>;
}
export interface AudioStageInit {sampleRate:AudioSampleRate;layout:AudioLayout;durationSamples:number;seed:number;
  /** Compatibility byte access, loaded on first access and bounded separately from PCM reads. */
  resources:Record<string,Uint8Array>;audio:AudioResourceService;
}
export interface AudioStageInstance<I=Record<string,PortValue|AudioBlockV1>,P=Record<string,unknown>,O extends Record<string,PortValue>=Record<string,PortValue>> {
  evaluateInterval(request:IntervalRequest,inputs:I,props:P):O|Promise<O>;
  /** Optional frame path for audio readers that expose JSON/Surface visualization. */
  renderAt?(context:FrameContext,inputs:I,props:P):O|Promise<O>;
  dispose?():void|Promise<void>;
}
export type AudioStageFactory<I=Record<string,PortValue|AudioBlockV1>,P=Record<string,unknown>,O extends Record<string,PortValue>=Record<string,PortValue>>=(init:AudioStageInit)=>AudioStageInstance<I,P,O>|Promise<AudioStageInstance<I,P,O>>;
export interface IntervalResult {outputs:Record<string,PortValue|AudioBlockV1>;coverage:Record<string,SampleInterval>;diagnostics:Diagnostic[]}
export const AUDIO_STAGE=Symbol.for('@frameweave/engine.audio-stage');
export type AuthoredAudioStage<I,P,O extends Record<string,PortValue>>=AudioStageFactory<I,P,O>&{[AUDIO_STAGE]:AudioStageMetadata};
export function assertAudioMetadata(value:unknown):asserts value is AudioStageMetadata {
  fields(value,['schemaVersion','sampleRate','layout','durationSamples','seek','lookbehindSamples','lookaheadSamples','latencySamples','tailSamples'],'Stage.audio');
  if(value.schemaVersion!==1)audioFail('E_AUDIO_VERSION','Stage.audio requires schemaVersion 1');assertSampleRate(value.sampleRate);channelLayout(value.layout as AudioLayout);integer(value.durationSamples,'Stage.audio.durationSamples',1);
  if(value.seek!=='stateless'||value.lookbehindSamples!==0||value.lookaheadSamples!==0||value.latencySamples!==0||value.tailSamples!==0)audioFail('E_AUDIO_DSP_CAPABILITY','Audio v1 implements stateless zero-latency blocks only; preroll, lookaround, state restoration and tails require an explicit future adapter');
}
export function defineAudioStage<I=Record<string,PortValue|AudioBlockV1>,P=Record<string,unknown>,O extends Record<string,PortValue>=Record<string,PortValue>>(
  metadata:Pick<AudioStageMetadata,'sampleRate'|'layout'|'durationSamples'>&Partial<AudioStageMetadata>,factory:AudioStageFactory<I,P,O>):AuthoredAudioStage<I,P,O>{
  const spec={schemaVersion:1,seek:'stateless',lookbehindSamples:0,lookaheadSamples:0,latencySamples:0,tailSamples:0,...metadata};assertAudioMetadata(spec);
  if(typeof factory!=='function')audioFail('E_AUDIO_FACTORY','Expected an audio Stage factory');
  Object.defineProperty(factory,AUDIO_STAGE,{value:Object.freeze({...spec}),enumerable:false});return factory as AuthoredAudioStage<I,P,O>;
}
