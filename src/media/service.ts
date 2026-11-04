import {buildProject} from '../compiler/build.ts';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {openRenderSession} from '../../modules/render-session/index.ts';
import {EngineError} from '../core/errors.ts';
import {ProfessionalVideoEncoder,mediaEncodingCapabilities,type ProfessionalEncodeOptions} from './encoding.ts';
import {writeExr} from './ocio.ts';
import {pixelsFromSurface} from './surface.ts';
import {assertMediaPolicy,type MediaPolicy} from './compositor.ts';
import {reportProgress,type ProgressSink} from '../core/progress.ts';
import {createCLIProgress} from '../cli-progress.ts';
export interface ProfessionalSettings {schemaVersion:1;media:MediaPolicy;video?:Omit<ProfessionalEncodeOptions,'fps'|'width'|'height'|'ffmpeg'>}
export async function readProfessionalSettings(file:string):Promise<ProfessionalSettings>{
  const bytes=await readFile(resolve(file));if(bytes.length>65536)throw new EngineError('E_MEDIA_SETTINGS','Settings exceed 64 KiB');let settings:ProfessionalSettings;try{settings=JSON.parse(bytes.toString('utf8'));}catch{throw new EngineError('E_MEDIA_SETTINGS','Malformed JSON settings');}
  if(settings.schemaVersion!==1||Object.keys(settings).some(k=>!['schemaVersion','media','video'].includes(k)))throw new EngineError('E_MEDIA_SETTINGS','Unknown settings schema/fields');
  assertMediaPolicy(settings.media);if(settings.video&&Object.keys(settings.video).some(k=>!['preset','outputColor','conversion','alpha','hdr10','audio','encoder'].includes(k)))throw new EngineError('E_MEDIA_SETTINGS','Video settings cannot inject dimensions, timing, executables or unknown fields');return settings;
}
/** Uses the existing Session and Renderer, never a second Stage scheduler. */
export async function exportProfessionalProject(request:{project:string;output:string;settings:ProfessionalSettings;frame?:number;allowWasm?:boolean;signal?:AbortSignal;onProgress?:ProgressSink}){
  const {settings}=request;assertMediaPolicy(settings.media);
  reportProgress(request.onProgress,{phase:'compile'});
  const build=await buildProject(request.project);if(build.manifest.stages.some(s=>s.engine==='native-gpu')){const {renderNativeProject}=await import('../../modules/native-gpu/service.ts');return renderNativeProject(request.project,{build,output:request.output,professional:settings,allowWasm:request.allowWasm,signal:request.signal,onProgress:request.onProgress,...request.frame===undefined?{}:{start:request.frame,end:request.frame+1}});}

  const session=await openRenderSession(request.project,{media:settings.media,allowWasm:request.allowWasm});let encoder:ProfessionalVideoEncoder|undefined;
  const cancel=()=>{void session.cancel();void encoder?.abort();};request.signal?.addEventListener('abort',cancel,{once:true});
  try{
    request.signal?.throwIfAborted();const {composition:c}=await session.describe();
    reportProgress(request.onProgress,{phase:'initialize'});
    if(request.frame!==undefined){reportProgress(request.onProgress,{phase:'first-frame'});const frame=await session.mediaFrame(request.frame);await writeExr(frame.surface,request.output);const p=pixelsFromSurface(frame.surface);let minimum=Infinity,maximum=-Infinity;for(let i=0;i<p.length;i++)if(i%4!==3){minimum=Math.min(minimum,p[i]);maximum=Math.max(maximum,p[i]);}
      return {output:resolve(request.output),format:'openexr',frame:request.frame,width:c.width,height:c.height,color:frame.surface.color,alpha:frame.surface.alpha,minimum,maximum,diagnostics:frame.diagnostics};}
    if(!settings.video)throw new EngineError('E_MEDIA_SETTINGS','Video settings are required for rendering');
    encoder=await ProfessionalVideoEncoder.create(request.output,{...settings.video,width:c.width,height:c.height,fps:c.fps});
    reportProgress(request.onProgress,{phase:'first-frame',completed:0,total:c.durationInFrames});
    for(let frame=0;frame<c.durationInFrames;frame++){request.signal?.throwIfAborted();await encoder.write((await session.mediaFrame(frame)).surface);reportProgress(request.onProgress,{phase:'render',completed:frame+1,total:c.durationInFrames});}
    reportProgress(request.onProgress,{phase:'finalize'});
    const report=await encoder.finish();encoder=undefined;return {output:resolve(request.output),frames:report.frames,preset:settings.video.preset,color:settings.video.outputColor,report:`${resolve(request.output)}.media.json`};
  }finally{request.signal?.removeEventListener('abort',cancel);await encoder?.abort();await session.close();}
}
export async function professionalMediaCLI(args:string[]){
  const [command,...rest]=args;if(command==='capabilities'){if(rest.some(x=>x!=='--json'))throw new EngineError('E_ARGUMENT','media capabilities [--json]');return mediaEncodingCapabilities();}
  if(!['frame','render'].includes(command))throw new EngineError('E_ARGUMENT','media frame|render <project> --settings file.json --output file [--frame N] [--allow-wasm] [--json]');
  const [project,...flags]=rest,values:Record<string,string|boolean>={};if(!project||project.startsWith('--'))throw new EngineError('E_ARGUMENT','Project entry required');
  for(let i=0;i<flags.length;i++){const key=flags[i].slice(2);if(!flags[i].startsWith('--')||!['settings','output','frame','allow-wasm','json'].includes(key)||Object.hasOwn(values,key))throw new EngineError('E_ARGUMENT','Unknown/repeated media option');if(['allow-wasm','json'].includes(key))values[key]=true;else{const value=flags[++i];if(!value||value.startsWith('--'))throw new EngineError('E_ARGUMENT','Missing media option value');values[key]=value;}}
  if(typeof values.settings!=='string'||typeof values.output!=='string'||command==='render'&&values.frame!==undefined)throw new EngineError('E_ARGUMENT','Explicit settings/output required; --frame is only for still output');
  const frame=command==='frame'?Number(values.frame??0):undefined;if(frame!==undefined&&(!Number.isSafeInteger(frame)||frame<0))throw new EngineError('E_ARGUMENT','Invalid frame');
  const progress=createCLIProgress(),settings=await readProfessionalSettings(values.settings),controller=new AbortController(),stop=()=>controller.abort();process.once('SIGINT',stop);
  try{return await exportProfessionalProject({project,output:values.output,settings,frame,onProgress:progress.update,allowWasm:values['allow-wasm']===true,signal:controller.signal});}finally{progress.close();process.off('SIGINT',stop);}
}
export {openMediaPreview,MediaPreviewSession,type MediaPreviewOptions} from './preview-session.ts';
