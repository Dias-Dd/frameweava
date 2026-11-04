import {mkdir,mkdtemp,open,link,rm,stat,type FileHandle} from 'node:fs/promises';
import {join,resolve,dirname,relative,basename} from 'node:path';
import {openRenderSession,type RenderSession} from '../../modules/render-session/index.ts';
import {ProfessionalVideoEncoder,type ProfessionalEncodeOptions} from '../media/encoding.ts';
import {linear709} from '../media/surface.ts';
import type {MediaPolicy} from '../media/compositor.ts';
import {EngineError} from '../core/errors.ts';
import {audioLimits,assertSampleRate,audioFail,integer,fields,type AudioBlockV1,type AudioSampleRate} from './block.ts';
import {audioPeaks} from './dsp.ts';
import {encodePcm,wavHeader,type Quantization,type WavFormat} from './wav.ts';
import type {SampleInterval} from './time.ts';
import type {audioProjectInfo} from './layers.ts';
import {catalog,fingerprint} from '../../modules/render-session/dependencies.ts';
import {reportProgress,type ProgressSink} from '../core/progress.ts';
import type {AudioResourceOptions} from './resource-options.ts';
export interface AudioSourceSeal {files:string[];catalogSignature:string;fingerprint:string}

export interface AudioExportOptions {project:string;output:string;format:'wav'|'mov'|'mp4';sampleRate:AudioSampleRate;layout:'mono'|'stereo';quantization:Quantization;wavFormat?:WavFormat;blockSamples?:number;video?:Omit<ProfessionalEncodeOptions,'audio'|'fps'|'width'|'height'>;media?:MediaPolicy;signal?:AbortSignal;startFrame?:number;endFrame?:number;expectedProjectHash?:string;expectedSourceSeal?:AudioSourceSeal;allowWasm?:boolean;onProgress?:ProgressSink;audioResources?:AudioResourceOptions}
interface AudioSessionHost {describeAudio(rate:AudioSampleRate):Promise<ReturnType<typeof audioProjectInfo>>;mixAudio(interval:SampleInterval,options:{layout:'mono'|'stereo';signal?:AbortSignal}):Promise<AudioBlockV1>}
function requireAudioHost(session:RenderSession):asserts session is RenderSession&AudioSessionHost {if(!('describeAudio'in session)||typeof session.describeAudio!=='function'||!('mixAudio'in session)||typeof session.mixAudio!=='function')throw new EngineError('E_AUDIO_UNAVAILABLE','Audio Session integration is not installed; apply the reviewed AU-1 core wiring before exporting');}
async function writeAll(handle:FileHandle,bytes:Uint8Array){let offset=0;while(offset<bytes.byteLength){const result=await handle.write(bytes,offset,bytes.byteLength-offset,null);if(!result.bytesWritten)audioFail('E_AUDIO_WRITE','PCM write made no progress');offset+=result.bytesWritten;}}
function checkCancelled(signal?:AbortSignal){if(signal?.aborted)throw new EngineError('E_RENDER_CANCELLED','Audio export cancelled');}
/** Existing Session + existing PME encoder. Audio-only WAV does not request a video frame. */
export async function exportAudioProject(options:AudioExportOptions){
  fields(options,['project','output','format','sampleRate','layout','quantization','wavFormat','blockSamples','video','media','signal','startFrame','endFrame','expectedProjectHash','expectedSourceSeal','allowWasm','onProgress','audioResources'],'audio export');
  if(typeof options.project!=='string'||!options.project||typeof options.output!=='string'||!options.output)audioFail('E_ARGUMENT','Audio export requires project and output paths');
  if(options.signal!==undefined&&!(options.signal instanceof AbortSignal))audioFail('E_ARGUMENT','signal must be an AbortSignal');
  if(options.onProgress!==undefined&&typeof options.onProgress!=='function')audioFail('E_ARGUMENT','onProgress must be a function');
  assertSampleRate(options.sampleRate);if(!['mono','stereo'].includes(options.layout))audioFail('E_AUDIO_LAYOUT','Export Mixer v1 supports mono/stereo');if(!['wav','mov','mp4'].includes(options.format)||!options.output.toLowerCase().endsWith('.'+options.format))audioFail('E_AUDIO_OUTPUT','Choose a matching explicit WAV/MOV/MP4 output');
  const size=options.blockSamples??4096;integer(size,'blockSamples',1,audioLimits.samples);checkCancelled(options.signal);
  reportProgress(options.onProgress,{phase:'compile'});
  const session=await openRenderSession(options.project,{allowWasm:options.allowWasm,audioResources:options.audioResources,...options.format==='wav'?{}:{media:options.media??{workingColor:linear709,legacySdr:'srgb'}}});let staging:string|undefined,encoder:ProfessionalVideoEncoder|undefined;
  const cancel=()=>{void session.cancel().catch(()=>{});};options.signal?.addEventListener('abort',cancel,{once:true});
  const output=resolve(options.output),parent=dirname(output);
  try{
    requireAudioHost(session);const info=await session.describeAudio(options.sampleRate),description=await session.describe(),c=description.composition;
    if(options.startFrame!==undefined&&options.startFrame!==0||options.endFrame!==undefined&&options.endFrame!==c.durationInFrames)audioFail('E_AUDIO_EXPORT_RANGE','Audio export v1 requires the full finite project range; partial ranges are not silently ignored');
    if(options.expectedProjectHash!==undefined&&description.hash!==options.expectedProjectHash)audioFail('E_AUDIO_PROJECT_CHANGED','Audio export project differs from the inspected output plan');
    if(options.expectedSourceSeal){const seal=options.expectedSourceSeal,state=await catalog(resolve(options.project));if(state.signature!==seal.catalogSignature||await fingerprint(seal.files,state.signature)!==seal.fingerprint)audioFail('E_AUDIO_PROJECT_CHANGED','Audio project sources/resources/locks changed after output planning');}
    if(options.format!=='wav'&&!info.hasVisual)audioFail('E_AUDIO_VIDEO_REQUIRED','Pure audio v1 exports WAV; MOV/MP4 require actual visual content, never fabricated frames');
    try{await stat(output);audioFail('E_AUDIO_OUTPUT_EXISTS','Refusing to overwrite an existing media output');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
    const format=options.format==='wav'?options.wavFormat??'float32':'pcm24';if(options.format==='wav')wavHeader({sampleRate:options.sampleRate,layout:options.layout,sampleCount:info.sampleCount,format});
    await mkdir(parent,{recursive:true});staging=await mkdtemp(join(parent,'.frameweave-audio-'));const raw=join(staging,'mix.pcm'),handle=await open(raw,'wx');let overloads=0;const peaks=Array<number>(options.layout==='mono'?1:2).fill(0);
    reportProgress(options.onProgress,{phase:'audio',completed:0,total:info.sampleCount,unit:'samples'});
    try{for(let start=0;start<info.sampleCount;start+=size){checkCancelled(options.signal);const block=await session.mixAudio({unit:'samples',sampleRate:options.sampleRate,start,endExclusive:Math.min(info.sampleCount,start+size)},{layout:options.layout,signal:options.signal});const encoded=encodePcm(block,format,options.quantization),detected=audioPeaks(block);overloads+=encoded.overloads;for(let i=0;i<peaks.length;i++)peaks[i]=Math.max(peaks[i],detected.peaks[i]);await writeAll(handle,encoded.bytes);reportProgress(options.onProgress,{phase:'audio',completed:Math.min(info.sampleCount,start+size),total:info.sampleCount,unit:'samples'});}}finally{await handle.close();}
    const temp=join(staging,'output.'+options.format);
    if(options.format==='wav'){reportProgress(options.onProgress,{phase:'finalize'});
      const input=await open(raw,'r'),dest=await open(temp,'wx');try{await writeAll(dest,wavHeader({sampleRate:options.sampleRate,layout:options.layout,sampleCount:info.sampleCount,format}));const buffer=Buffer.alloc(65536);let count=0;for(;;){checkCancelled(options.signal);const r=await input.read(buffer,0,buffer.length,null);if(!r.bytesRead)break;count+=r.bytesRead;await writeAll(dest,buffer.subarray(0,r.bytesRead));}if(count%2)await writeAll(dest,new Uint8Array([0]));}finally{await input.close();await dest.close();}
    }else{
      if(!options.video)audioFail('E_MEDIA_SETTINGS','Explicit existing PME video encoding settings are required');
      encoder=await ProfessionalVideoEncoder.create(temp,{...options.video,width:c.width,height:c.height,fps:c.fps,audio:{path:raw,sampleRate:options.sampleRate,channels:peaks.length,channelLayout:options.layout,format:'s24le',startSample:0}});
      reportProgress(options.onProgress,{phase:'first-frame',completed:0,total:c.durationInFrames});
      for(let frame=0;frame<c.durationInFrames;frame++){checkCancelled(options.signal);await encoder.write((await session.mediaFrame(frame)).surface);reportProgress(options.onProgress,{phase:'render',completed:frame+1,total:c.durationInFrames});}reportProgress(options.onProgress,{phase:'finalize'});await encoder.finish();encoder=undefined;
    }
    checkCancelled(options.signal);await session.close();checkCancelled(options.signal);await link(temp,output);
    return {schemaVersion:1 as const,kind:'frameweave.audio-export' as const,ok:true,output,format:options.format,sampleRate:options.sampleRate,layout:options.layout,sampleCount:info.sampleCount,tracks:info.tracks,overloads,peaks,pcmFormat:format,quantization:options.quantization,lossy:options.format==='mp4',audioCodec:options.format==='mp4'?'aac':options.format==='mov'?'pcm_s24le':format};
  }catch(e){checkCancelled(options.signal);if(e instanceof EngineError)throw e;throw new EngineError('E_AUDIO_EXPORT',`Audio export failed: ${(e as Error).message}`,{details:{output}});
  }finally{options.signal?.removeEventListener('abort',cancel);await encoder?.abort();try{await session.close();}finally{if(staging){const r=relative(parent,staging);if(!r.startsWith('..')&&dirname(staging)===parent&&basename(staging).startsWith('.frameweave-audio-'))await rm(staging,{recursive:true,force:true});}}}
}
