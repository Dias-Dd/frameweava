import {mkdir,writeFile,unlink} from 'node:fs/promises';
import {dirname,extname,join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {RenderSession} from '../render-session/index.ts';
import {hasSharedState} from './plan.ts';
import type {BuiltProject} from '../../src/core/types.ts';
import type {NativeRenderOptions} from '../native-gpu/service.ts';
import {EngineError} from '../../src/core/errors.ts';
import {linear709,srgb} from '../../src/media/surface.ts';
import {mediaPreview} from '../../src/media/node.ts';
import {writeExr} from '../../src/media/ocio.ts';
import {ProfessionalVideoEncoder,type ProfessionalEncodeOptions} from '../../src/media/encoding.ts';
import {assertMediaPolicy} from '../../src/media/compositor.ts';
import {reportProgress} from '../../src/core/progress.ts';

/** Shared frame history is owned by the formal RenderSession. The existing Native
 * GPU still evaluates all pixels; final delivery explicitly materializes F32. */
export async function renderSharedNativeProject(project:string,build:BuiltProject,options:NativeRenderOptions&{start:number;end:number},executable:string,compileMs:number,renderAudio:(path:string)=>Promise<{sampleRate:48000|96000;sampleCount:number;layout:string;format:string}>){
  if(!hasSharedState(build))throw new EngineError('E_SHARED_DECLARATION','Expected explicit shared declarations');
  if(options.professionalBackend==='gpu')throw new EngineError('E_SHARED_NATIVE_EXPORT_PROFILE','Shared transactions currently use explicit F32 delivery; the resident encoder profile needs a qualified transaction boundary');
  const started=performance.now(),output=options.output,extension=extname(output).toLowerCase(),still=extension==='.png'||extension==='.exr',c=build.manifest.composition;
  const media=options.professional?.media??{workingColor:linear709,legacySdr:'srgb' as const,preview:{color:srgb,clip:true}};
  assertMediaPolicy(media);await mkdir(dirname(output),{recursive:true});
  const hasAudio=!still&&build.manifest.layers.some(l=>l.source&&build.manifest.stages.find(s=>s.id===l.source!.$ref)?.outputs[l.source.port]==='audio');
  if(hasAudio&&options.professional?.video?.audio)throw new EngineError('E_MEDIA_AUDIO','Choose placed Audio or explicit PCM, not both');
  const pcmPath=join(dirname(output),'.frameweave-shared-audio-'+randomBytes(12).toString('hex')+'.f32');
  const session=new RenderSession(project,{width:options.width,height:options.height,allowWasm:options.allowWasm,timeoutMs:options.timeoutMs,media,
    nativeGpu:{executable,rayQuery:options.allowRayQuery,maxBytes:options.maxBytes}});
  let encoder:ProfessionalVideoEncoder|undefined;
  const cancel=()=>{void session.cancel().catch(()=>{});};options.signal?.addEventListener('abort',cancel,{once:true});
  try{
    const pcm=hasAudio?await renderAudio(pcmPath):undefined;
    for(let frame=options.start;frame<options.end;frame++){
      if(options.signal?.aborted)throw new EngineError('E_RENDER_CANCELLED','Shared output cancelled');
      reportProgress(options.onProgress,{phase:frame===options.start?'first-frame':'render',completed:frame-options.start,total:options.end-options.start});
      const rendered=await session.mediaFrame(frame),surface=rendered.surface;
      if(extension==='.png')await writeFile(output,await mediaPreview(surface,{...media,preview:media.preview??{color:srgb,clip:true}}));
      else if(extension==='.exr'){if(surface.format!=='rgba16float'&&surface.format!=='rgba32float')throw new EngineError('E_MEDIA_FORMAT','EXR requires a floating Native surface');await writeExr(surface,output,surface.format);}
      else{
        const video:Omit<ProfessionalEncodeOptions,'fps'|'width'|'height'>=options.professional?.video??{preset:'sdr-h264' as const,outputColor:srgb,conversion:{kind:'colorimetric' as const,clip:true},alpha:{mode:'flatten' as const,matte:[0,0,0] as [number,number,number]}};
        encoder??=await ProfessionalVideoEncoder.create(output,{...video,encoder:options.encoder??video.encoder,...pcm?{audio:{path:pcmPath,sampleRate:pcm.sampleRate,channels:2,channelLayout:'stereo',format:'f32le',startSample:0}}:{},fps:c.fps,width:surface.width,height:surface.height});
        await encoder.write(surface);
      }
    }
    reportProgress(options.onProgress,{phase:'finalize'});const report=await encoder?.finish();encoder=undefined;
    const result={version:1,ok:true,backend:'native-wgpu',output,frames:options.end-options.start,startFrame:options.start,endFrame:options.end,
      stats:await session.nativeStats(),audio:pcm??(options.professional?.video?.audio?{sampleRate:options.professional.video.audio.sampleRate,sampleCount:undefined,layout:options.professional.video.audio.channelLayout,format:options.professional.video.audio.format}:null),shared:session.status().shared,scheduling:{mode:'shared-transactions',concurrency:1},timings:{compileMs,totalMs:performance.now()-started+compileMs},
      transfer:{exportMaterialization:true,format:'rgba32float',route:'Native GPU → explicit F32 delivery → existing PME encoding'},report,diagnostics:[]};
    await writeFile(output+'.diagnostics.json',JSON.stringify(result,null,2)+'\n');return result;
  }finally{options.signal?.removeEventListener('abort',cancel);await encoder?.abort();await session.close();await unlink(pcmPath).catch(e=>{if(e.code!=='ENOENT')throw e;});}
}
