import {EngineError} from '../../src/core/errors.ts';
import {assertAudioBlock,type AudioBlockV1} from '../../src/audio/block.ts';
import type {AudioStageInit} from '../../src/audio/contract.ts';
import type {SampleInterval} from '../../src/audio/time.ts';
import {inspectWav,readWavBlock} from '../../src/audio/wav.ts';
import type {EditAudioInfo} from './audio.ts';

export interface EditAudioConversion {readonly sampleRate:'reject'|'resample';readonly layout:'reject'|'remix'}
/** Structural subset of the frozen Core 3b59e16 AudioResourceService. Keeping this
 * seam optional preserves the old small-WAV profile on an unsynchronized Core.
 * It is a borrowed AU-1 service, never a second decoder, IPC or resource registry. */
export interface EditAudioResourceInfo {resourceId:string;stream:number;sampleRate:number;channels:number;layout?:string;sampleCount?:number;decoder:'wav-pcm'|'ffmpeg'}
export interface EditAudioResourceInspector {info(id:string,stream:number):Promise<EditAudioResourceInfo>}
interface AudioResourceService extends EditAudioResourceInspector {
 read(request:{resourceId:string;stream:number;interval:SampleInterval;layout:'mono'|'stereo';conversion:EditAudioConversion}):Promise<AudioBlockV1>;
}
export async function createAudioSourceReader(init:AudioStageInit,info:EditAudioInfo):Promise<(start:number,end:number)=>Promise<AudioBlockV1>> {
 const service=(init as AudioStageInit&{audio?:AudioResourceService}).audio,stream=info.stream??0,conversion=info.conversion??{sampleRate:'reject',layout:'reject'};
 if(service!==undefined){
  if(!service||typeof service.info!=='function'||typeof service.read!=='function')throw new EngineError('E_EDIT_AUDIO_RESOURCE','Core audio Resource service is malformed');
  // Select the service BEFORE touching legacy resources: its getter can load a
  // whole source and deliberately rejects large files even on the new Core.
  const actual=await service.info(info.id,stream);
  if(actual.resourceId!==info.id||actual.stream!==stream||conversion.sampleRate==='reject'&&actual.sampleRate!==info.sampleRate||conversion.layout==='reject'&&actual.layout!==info.layout)throw new EngineError('E_EDIT_AUDIO_METADATA','Audio metadata differs from the authored source; choose an explicit conversion or inspect and reopen it');
  if(actual.sampleCount!==undefined){
   // The declared output view keeps only complete samples after an explicitly
   // requested rate conversion. Actual decoder coverage is still checked below.
   if(BigInt(actual.sampleCount)*BigInt(info.sampleRate)/BigInt(actual.sampleRate)!==BigInt(info.sampleCount))throw new EngineError('E_EDIT_AUDIO_METADATA','Exact source duration differs from the authored sampleCount');
  }
  return async(start,end)=>{
   const block=await service.read({resourceId:info.id,stream,interval:{unit:'samples',sampleRate:info.sampleRate,start,endExclusive:end},layout:info.layout,conversion:{...conversion}});
   assertAudioBlock(block);
   if(block.startSample!==start||block.sampleCount!==end-start||block.sampleRate!==info.sampleRate||block.channelLayout.name!==info.layout||block.validRange.start!==0||block.validRange.endExclusive!==block.sampleCount)throw new EngineError('E_EDIT_AUDIO_COVERAGE','Core audio interval does not exactly cover the requested source samples');
   return block;
  };
 }
 if(stream!==0||conversion.sampleRate!=='reject'||conversion.layout!=='reject')throw new EngineError('E_EDIT_AUDIO_CORE','Audio stream selection/conversion requires the Core Audio Resource interval service');
 const bytes=init.resources[info.id];if(!(bytes instanceof Uint8Array))throw new EngineError('E_EDIT_AUDIO_RESOURCE','Audio source is not a declared Resource');
 const actual=inspectWav(bytes);if(actual.sampleRate!==info.sampleRate||actual.layout!==info.layout||actual.sampleCount!==info.sampleCount)throw new EngineError('E_EDIT_AUDIO_METADATA','WAV metadata differs from the authored source; inspect and reopen it');
 return async(start,end)=>readWavBlock(bytes,start,end);
}
