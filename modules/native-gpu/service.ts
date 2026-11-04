import {mkdir,rename,unlink,writeFile,open,access} from 'node:fs/promises';
import {resolve,dirname,extname,join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {Renderer} from '../../src/render/renderer.ts';
import {buildProject} from '../../src/compiler/build.ts';
import type {BuiltProject} from '../../src/core/types.ts';
import {EngineError} from '../../src/core/errors.ts';
import {ffmpegPath} from '../../src/encoding/ffmpeg.ts';
import {NativeFrameScheduler} from './scheduler.ts';
import {nativeExecutable} from './executable.ts';
import {layersForMedia} from '../../src/core/output-plan.ts';
import {mixAudioLayers} from '../../src/audio/layers.ts';
import {frameToSample} from '../../src/audio/time.ts';
import {encodePcm,wavHeader} from '../../src/audio/wav.ts';
import {injectHdrMetadata} from '../../src/media/hdr-metadata.ts';
import {prepareNativeMediaExport} from './media-export.ts';
import {ProfessionalVideoEncoder} from '../../src/media/encoding.ts';
import {assertMediaPolicy} from '../../src/media/compositor.ts';
import {samePixelColor} from '../gpu-effects/pixel-shader.ts';
import {writeExr} from '../../src/media/ocio.ts';
import type {ProfessionalSettings} from '../../src/media/service.ts';
import type {NativeProgram} from './client.ts';
import {reportProgress,type ProgressSink} from '../../src/core/progress.ts';
import {hasSharedState} from '../shared-state/plan.ts';
import {renderSharedNativeProject} from '../shared-state/native-delivery.ts';

export interface NativeRenderOptions {onProgress?:ProgressSink;professional?:ProfessionalSettings;professionalBackend?:'reference'|'gpu';output:string;width?:number;height?:number;start?:number;end?:number;native?:string;allowRayQuery?:boolean;allowWasm?:boolean;timeoutMs?:number;maxBytes?:number;maxConcurrency?:number;initialConcurrency?:number;encoder?:'h264_nvenc'|'hevc_nvenc'|'av1_nvenc'|'libx264'|'libx265'|'libaom-av1';signal?:AbortSignal;build?:BuiltProject;compileMs?:number}
const exec=promisify(execFile);
async function audioTrack(build:BuiltProject,path:string,startFrame:number,endFrame:number,signal?:AbortSignal,raw=false,onProgress?:ProgressSink){
 const stages=build.manifest.stages.filter(s=>s.engine==='audio'),ids=new Set(stages.map(s=>s.id));
 if(stages.some(s=>Object.values(s.inputs).some(v=>v&&typeof v==='object'&&'$ref'in v&&!ids.has(String(v.$ref)))))throw new EngineError('E_NATIVE_AUDIO_DEPENDENCY','Native audio input must be an explicit supported audio dependency; cross-media values need the shared execution adapter');
 const rate=stages[0]?.audio?.sampleRate;if(!rate)throw new EngineError('E_AUDIO_METADATA','Placed audio requires a declared sample rate');
 const renderer=await Renderer.createAudio(build),handle=await open(path,'wx').catch(async error=>{await renderer.close();throw error;});
 const start=frameToSample(startFrame,rate,build.manifest.composition.fps),end=frameToSample(endFrame,rate,build.manifest.composition.fps);
 const cancel=()=>{void renderer.close().catch(()=>{});};signal?.addEventListener('abort',cancel,{once:true});
 try{
  if(signal?.aborted){cancel();throw new EngineError('E_RENDER_CANCELLED','Audio export cancelled');}
  if(!raw)await handle.write(wavHeader({sampleRate:rate,layout:'stereo',sampleCount:end-start,format:'float32'}));
  reportProgress(onProgress,{phase:'audio',completed:0,total:end-start,unit:'samples'});for(let first=start;first<end;first+=4096){if(signal?.aborted)throw new EngineError('E_RENDER_CANCELLED','Audio export cancelled');const block=await mixAudioLayers(build.manifest,{unit:'samples',sampleRate:rate,start:first,endExclusive:Math.min(end,first+4096)},{layout:'stereo',gap:'silence',evaluate:async(interval,stageId)=>renderer.evaluateInterval(interval,stageId)}),encoded=encodePcm(block,'float32',{clip:'reject',dither:{kind:'none'}});let offset=0;while(offset<encoded.bytes.length){const n=await handle.write(encoded.bytes,offset,encoded.bytes.length-offset);if(!n.bytesWritten)throw new EngineError('E_AUDIO_WRITE','PCM output made no progress');offset+=n.bytesWritten;}reportProgress(onProgress,{phase:'audio',completed:Math.min(end,first+4096)-start,total:end-start,unit:'samples'});}
 }catch(error){if(signal?.aborted)throw new EngineError('E_RENDER_CANCELLED','Audio export cancelled');throw error;}
 finally{signal?.removeEventListener('abort',cancel);await handle.close();await renderer.close();}
 return {sampleRate:rate,sampleCount:end-start,layout:'stereo',format:'float32'};
}
/** Existing compiler + Renderer + AU-1 mixer. Native FFmpeg input is GPU-packed
 * raw data from Rust, never PNG transported through Node. */
export async function renderNativeProject(project:string,options:NativeRenderOptions){
 const checkCancellation=()=>{if(options.signal?.aborted)throw new EngineError('E_RENDER_CANCELLED','Native export cancelled');};checkCancellation();
 if(!options.build)reportProgress(options.onProgress,{phase:'compile'});
 const started=performance.now(),build=options.build??await buildProject(project),compileMs=options.compileMs??(options.build?0:performance.now()-started),c=build.manifest.composition,start=options.start??0,end=options.end??c.durationInFrames;
 checkCancellation();
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<=start||end>c.durationInFrames)throw new EngineError('E_FRAME_RANGE','Native export requires a finite composition frame range');
 const output=resolve(options.output),extension=extname(output).toLowerCase(),still=extension==='.png'||extension==='.exr';if(!['.png','.exr','.mp4','.mov'].includes(extension)||still&&end-start!==1)throw new EngineError('E_NATIVE_FORMAT','Use a single PNG/EXR frame or finite MP4/MOV');
 reportProgress(options.onProgress,{phase:'initialize'});
 await mkdir(dirname(output),{recursive:true});const id=randomBytes(8).toString('hex'),temporary=join(dirname(output),`.frameweave-native-${id}${extension}`),audio=join(dirname(output),`.frameweave-native-${id}.wav`),mux=join(dirname(output),`.frameweave-mux-${id}${extension}`);
 const executable=await nativeExecutable(options.native);
 if(hasSharedState(build))return renderSharedNativeProject(project,build,{...options,output,start,end},executable,compileMs,path=>audioTrack(build,path,start,end,options.signal,true,options.onProgress));
 if(options.professional&&options.professionalBackend!=='gpu')return renderAccurateNative(build,{...options,output,start,end},executable,compileMs);
 const professional=options.professional;
 if(professional){if(professional.schemaVersion!==1)throw new EngineError('E_MEDIA_SETTINGS','Professional settings v1 required');assertMediaPolicy(professional.media);try{await access(output);throw new EngineError('E_MEDIA_OUTPUT_EXISTS','Refusing to overwrite professional output');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}}
 if(options.professionalBackend==='gpu'&&(!professional?.video||still))throw new EngineError('E_NATIVE_MEDIA_PROFILE','GPU professional output requires video settings and MP4/MOV');
 const taggedFile=join(dirname(output),'.frameweave-direct-tagged-'+id+'.ivf');
 const directFile=join(dirname(output),'.frameweave-direct-'+id+((options.encoder??professional?.video?.encoder)==='av1_nvenc'?'.ivf':'.hevc'));
 const direct=professional?await prepareNativeMediaExport(directFile,professional.media.workingColor,{...professional.video!,...options.encoder?{encoder:options.encoder}:{},fps:c.fps,width:options.width??c.width,height:options.height??c.height},options.signal,{maxPreparedBytes:options.maxBytes??1024**3,timeoutMs:options.timeoutMs}):undefined;
 const settings:Omit<NonNullable<NativeProgram['export']>,'image'|'display'>={executable:ffmpegPath(),output:temporary,fps:[c.fps.num,c.fps.den],codec:extension==='.png'?'png':extension==='.exr'?'exr':options.encoder??'h264_nvenc',format:extension==='.png'?'rgba':extension==='.exr'?'gbrapf32le':'nv12'};
 const encoderVersion=(await exec(settings.executable,['-version'],{windowsHide:true,timeout:10000,maxBuffer:128*1024})).stdout.split(/\r?\n/)[0];
 if(extension==='.exr'&&!/^ffmpeg version 6\.1\.1(?:\s|-)/.test(encoderVersion))throw new EngineError('E_NATIVE_EXR_ENCODER_VERSION','Native EXR float/Alpha export is qualified with bundled FFmpeg 6.1.1; this external version needs an actual Alpha roundtrip qualification',{details:{encoderVersion},hint:'Use the bundled default FFmpeg. FFmpeg 9.0.2 was observed to premultiply EXR RGB and is not qualified.'});
 let renderer:Renderer|undefined;
 try{
  checkCancellation();reportProgress(options.onProgress,{phase:'first-frame',completed:0,total:end-start});const initStart=performance.now();renderer=await Renderer.create(build,{width:options.width,height:options.height,allowWasm:options.allowWasm,timeoutMs:options.timeoutMs,nativeGpu:{executable,rayQuery:options.allowRayQuery,dynamic:'throughput',maxBytes:options.maxBytes,slots:Math.min(options.maxConcurrency??128,end-start),...direct?{mediaExport:direct}:{export:settings}}});await renderer.prepareNativeFrame(start,{signal:options.signal});const initMs=performance.now()-initStart,capacity=(await renderer.nativeStats()).slots as number;
  const requested=options.initialConcurrency;if(requested!==undefined&&(!Number.isSafeInteger(requested)||requested<1))throw new EngineError('E_NATIVE_SCHEDULER','Initial concurrency must be a positive safe integer');
  const scheduler=new NativeFrameScheduler({mode:'throughput',capacity,initial:requested===undefined?undefined:Math.min(requested,capacity)}),renderStart=performance.now();
  for(let frame=start;frame<end;){if(options.signal?.aborted)throw new EngineError('E_RENDER_CANCELLED','Native export cancelled');const count=Math.min(scheduler.concurrency,end-frame),indices=Array.from({length:count},(_,n)=>frame+n),begin=performance.now();const tickets=await renderer.submitNativeBatch(indices,{signal:options.signal});await Promise.all(tickets.map(t=>t.completed));scheduler.observe(count,Math.max(.001,performance.now()-begin));frame+=count;reportProgress(options.onProgress,{phase:'render',completed:frame-start,total:end-start});}
  reportProgress(options.onProgress,{phase:'finalize'});
  const framePipelineMs=performance.now()-renderStart,stats=await renderer.nativeStats(),finishStart=performance.now();await renderer.close();renderer=undefined;const encoderFinishMs=performance.now()-finishStart;
  const hasAudio=!still&&build.manifest.layers.some(l=>l.source&&build.manifest.stages.find(s=>s.id===l.source!.$ref)?.outputs[l.source.port]==='audio');let pcm:Awaited<ReturnType<typeof audioTrack>>|undefined;
  if(direct){
   if(hasAudio)pcm=await audioTrack(build,audio,start,end,options.signal,false,options.onProgress);
   if(professional?.video?.audio)throw new EngineError('E_NATIVE_MEDIA_AUDIO','Direct GPU export currently accepts placed AU-1 audio, not a second external PCM source');
   const av1=direct.codec==='av1_nvenc';if(av1&&professional!.video!.hdr10)await injectHdrMetadata(directFile,taggedFile,'av1',professional!.video!.hdr10);const encodedInput=av1&&professional!.video!.hdr10?taggedFile:directFile,args=['-v','error','-nostdin','-n',...av1?['-f','ivf']:['-r',c.fps.num+'/'+c.fps.den,'-f','hevc'],'-i',encodedInput,...pcm?['-i',audio,'-map','0:v:0','-map','1:a:0','-c:a',extension==='.mp4'?'aac':'pcm_s24le']:['-an'],'-c:v','copy','-color_primaries','bt2020','-color_trc',direct.transfer===16?'smpte2084':'arib-std-b67','-colorspace','bt2020nc','-color_range','tv',...av1?[]:['-tag:v','hvc1'],'-movflags','+faststart',output];
   await exec(ffmpegPath(),args,{windowsHide:true,timeout:120000,maxBuffer:4*1024**2,signal:options.signal});
  }else if(hasAudio){pcm=await audioTrack(build,audio,start,end,options.signal,false,options.onProgress);reportProgress(options.onProgress,{phase:'mux'});await exec(ffmpegPath(),['-v','error','-nostdin','-y','-i',temporary,'-i',audio,'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','192k','-movflags','+faststart',mux],{windowsHide:true,timeout:120000,maxBuffer:4*1024**2,signal:options.signal});await rename(mux,output);}else await rename(temporary,output);
  const result={version:1,ok:true,backend:'native-wgpu',output,frames:end-start,startFrame:start,endFrame:end,encoder:direct?.codec??settings.codec,encoderVersion,audio:pcm??null,timings:{compileMs,compilation:'included-or-explicit-cached-build',initMs,framePipelineMs,encoderFinishMs,totalMs:performance.now()-started+(options.build?compileMs:0)},scheduling:scheduler.stats(),stats,transfer:direct?{previewReadback:false,exportMaterialization:false,format:'p010le',route:'resident F32 → GPU colour + P010 → registered NVENC GPU resource → compressed bytes only',zeroCopyEncode:false,gpuResidentEncode:true,cpuPixelRoundTrip:false,provenance:direct.provenance}:{previewReadback:false,exportMaterialization:true,format:settings.format,route:'native GPU → asynchronous packed buffer → FFmpeg stdin',zeroCopyEncode:false},diagnostics:[]};await writeFile(`${output}.diagnostics.json`,JSON.stringify(result,null,2)+'\n');return result;
 }finally{await renderer?.close();for(const p of [temporary,audio,mux,directFile,taggedFile])await unlink(p).catch(e=>{if(e.code!=='ENOENT')throw e;});}
}

/** Accurate final output reuses PME's existing colour and encoder contracts.
 * CPU materialization is explicit delivery work, never the native preview path. */
async function renderAccurateNative(build:BuiltProject,options:NativeRenderOptions&{start:number;end:number},executable:string,compileMs:number){
 const started=performance.now(),settings=options.professional!,c=build.manifest.composition,output=resolve(options.output),still=output.toLowerCase().endsWith('.exr');
 if(settings.schemaVersion!==1)throw new EngineError('E_MEDIA_SETTINGS','Accurate output needs professional settings v1');assertMediaPolicy(settings.media);
 if(!still&&!/\.(mp4|mov)$/i.test(output))throw new EngineError('E_NATIVE_FORMAT','Accurate output supports EXR stills and MP4/MOV video');if(still&&options.end-options.start!==1)throw new EngineError('E_NATIVE_FORMAT','EXR requires one frame');if(!still&&!settings.video)throw new EngineError('E_MEDIA_SETTINGS','Accurate video export requires explicit video settings');
 const pcmPath=join(dirname(output),'.frameweave-audio-'+randomBytes(12).toString('hex')+'.f32');
 let pcm:Awaited<ReturnType<typeof audioTrack>>|undefined;
 const placedAudio=!still&&layersForMedia(build.manifest,'audio').length>0;
 if(placedAudio&&settings.video?.audio)throw new EngineError('E_MEDIA_AUDIO','Choose placed AU-1 audio or explicit PCM, not both');
 const renderer=await Renderer.create(build,{width:options.width,height:options.height,allowWasm:options.allowWasm,timeoutMs:options.timeoutMs,nativeGpu:{executable,rayQuery:options.allowRayQuery,dynamic:'throughput',slots:1,maxBytes:options.maxBytes,readback:'final-surface'}});let encoder:ProfessionalVideoEncoder|undefined;
 try{if(placedAudio)pcm=await audioTrack(build,pcmPath,options.start,options.end,options.signal,true);for(let frame=options.start;frame<options.end;frame++){if(options.signal?.aborted)throw new EngineError('E_RENDER_CANCELLED','Accurate output cancelled');const surface=await renderer.renderNativeSurface(frame,{signal:options.signal});if(!samePixelColor(surface.color,settings.media.workingColor))throw new EngineError('E_NATIVE_COLOR_POLICY','Native composition working colour differs from professional settings; use explicit convertColor before composition');
  if(still){await writeExr(surface,output,surface.format==='rgba16float'?'rgba16float':'rgba32float');}
  else{encoder??=await ProfessionalVideoEncoder.create(output,{...settings.video!,...options.encoder?{encoder:options.encoder}:{},...pcm?{audio:{path:pcmPath,sampleRate:pcm.sampleRate,channels:2,channelLayout:'stereo',format:'f32le',startSample:0}}:{},fps:c.fps,width:surface.width,height:surface.height});await encoder.write(surface);}
 }const report=await encoder?.finish();encoder=undefined;const explicit=settings.video?.audio;return{version:1,ok:true,backend:'native-wgpu',output,frames:options.end-options.start,audio:pcm??(explicit?{sampleRate:explicit.sampleRate,sampleCount:undefined,layout:explicit.channelLayout,format:explicit.format}:null),accuracy:'PME reference output transform',previewTransform:false,timings:{compileMs,totalMs:performance.now()-started+compileMs},transfer:{previewReadback:false,exportMaterialization:true,format:'rgba32float',route:'native Surface → explicit F32 final-delivery lease → PME colour transform → encoder'},stats:await renderer.nativeStats(),report};
 }finally{await encoder?.abort();await renderer.close();await unlink(pcmPath).catch(e=>{if(e.code!=='ENOENT')throw e;});}
}
