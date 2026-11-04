import {mkdir,writeFile} from 'node:fs/promises';
import {dirname,resolve,extname} from 'node:path';
import {catalog,dependencies as projectDependencies,fingerprint} from '../../modules/render-session/dependencies.ts';
import {buildProject} from '../compiler/build.ts';
import {openRenderSession,type RenderSessionOptions} from '../../modules/render-session/index.ts';
import {VideoEncoder} from '../encoding/ffmpeg.ts';
import type {Diagnostic} from '../core/types.ts';
import {EngineError} from '../core/errors.ts';
import {planOutput,type OutputFormat,type OutputPlan} from '../core/output-plan.ts';
import {exportAudioProject,type AudioExportOptions,type AudioSourceSeal} from '../audio/service.ts';
import {linear709} from '../media/surface.ts';
import {ProfessionalVideoEncoder} from '../media/encoding.ts';
import {reportProgress,type ProgressSink} from '../core/progress.ts';
const defaultVideo={preset:'sdr-h264',outputColor:{...linear709,transfer:'rec709',reference:'display'},conversion:{kind:'colorimetric',clip:true},alpha:{mode:'flatten',matte:[0,0,0]}} as const;
export {planOutput,type OutputPlan,type OutputFormat};
export interface CreationResult {output:string;plan:OutputPlan;frames?:number;width?:number;height?:number;diagnostics:Diagnostic[];audioResult?:unknown}
export interface CreationRequest {project:string;output:string;format?:OutputFormat;start?:number;end?:number;signal?:AbortSignal;onProgress?:ProgressSink;render?:RenderSessionOptions;audio?:Pick<AudioExportOptions,'sampleRate'|'layout'|'quantization'|'wavFormat'|'blockSamples'|'video'>}
/** Main wires this narrow dependency to AU-1's reviewed export service. No registry, plugin execution or audio implementation here. */
export interface CreationAudioExporter {export(request:CreationRequest&{plan:OutputPlan;projectHash:string;sourceSeal:AudioSourceSeal}):Promise<unknown>}
const formalAudio:CreationAudioExporter={async export(ctx){
 const {plan}=ctx;if(plan.format==='png')throw new EngineError('E_OUTPUT_FORMAT','PNG is not an audio export');
 return exportAudioProject({project:ctx.project,output:ctx.output,format:plan.format,
  sampleRate:ctx.audio?.sampleRate??48000,layout:ctx.audio?.layout??'stereo',quantization:ctx.audio?.quantization??{clip:'reject',dither:{kind:'none'}},
  ...ctx.audio,video:ctx.audio?.video??{...defaultVideo,alpha:{mode:'flatten',matte:[0,0,0]}},
  onProgress:ctx.onProgress,allowWasm:ctx.render?.allowWasm,media:ctx.render?.media,audioResources:ctx.render?.audioResources,signal:ctx.signal,startFrame:plan.start,endFrame:plan.end,expectedSourceSeal:ctx.sourceSeal});
}};
/** Optional high-level convenience entry. Existing CLI/export commands retain their exact behavior. */
export async function renderCreation(request:CreationRequest,dependencies:{audio?:CreationAudioExporter}={}):Promise<CreationResult>{
 request.signal?.throwIfAborted();reportProgress(request.onProgress,{phase:'compile'});const built=await buildProject(request.project),plan=planOutput(built.manifest,request);
 const project=resolve(request.project),state=await catalog(project),files=await projectDependencies(project,built),seal=await fingerprint(files,state.signature);
 // Infer only from actually placed audio. Unplaced tracks do not select the export rate.
 const rates=[...new Set(built.manifest.layers.flatMap(l=>{const s=l.source&&built.manifest.stages.find(s=>s.id===l.source!.$ref);return s&&s.outputs[l.source!.port]==='audio'&&s.audio?[s.audio.sampleRate]:[];}))];
 if(plan.audio&&!request.audio&&rates.length===1)request={...request,audio:{sampleRate:rates[0],layout:'stereo',quantization:{clip:'reject',dither:{kind:'none'}}}};
 const extension=extname(request.output).toLowerCase();if(extension!==`.${plan.format}`)throw new EngineError('E_OUTPUT_FORMAT',`Output extension must match selected ${plan.format}; specify format explicitly to override the default.`);
 if(plan.format==='wav'||plan.audio&&['mp4','mov'].includes(plan.format)){
  if(request.render?.width!==undefined||request.render?.height!==undefined||request.render?.mode==='preview')throw new EngineError('E_AUDIO_OUTPUT_SIZE','Audio media export uses project dimensions and accurate frames; preview resizing is unsupported.');
  request.signal?.throwIfAborted();const audioResult=await (dependencies.audio??formalAudio).export({...request,plan,projectHash:built.hash,sourceSeal:{files,catalogSignature:state.signature,fingerprint:seal}});return {output:resolve(request.output),plan,diagnostics:plan.diagnostics,audioResult};
 }
 // Session remains the sole V-SHARED host and transaction owner. Never duplicate its queue.
 reportProgress(request.onProgress,{phase:'initialize'});
 const session=await openRenderSession(project,{...request.render,...plan.format==='mov'?{media:request.render?.media??{workingColor:linear709,legacySdr:'srgb'}}:{}});let encoder:VideoEncoder|ProfessionalVideoEncoder|undefined;
 const cancel=()=>{void session.cancel();void encoder?.abort();};request.signal?.addEventListener('abort',cancel,{once:true});
 try{
  request.signal?.throwIfAborted();const description=await session.describe();
  if(JSON.stringify(description.composition)!==JSON.stringify(built.manifest.composition)||(await catalog(project)).signature!==state.signature||await fingerprint(files,state.signature)!==seal)throw new EngineError('E_CREATION_CHANGED','Project changed between output planning and execution. Re-run with the current project.');
  const c=built.manifest.composition,width=request.render?.width??(request.render?.height?Math.round(c.width*request.render.height/c.height):request.render?.mode==='preview'?Math.min(640,c.width):c.width),height=request.render?.height??Math.round(c.height*width/c.width);
  const output=resolve(request.output);await mkdir(dirname(output),{recursive:true});
  if(plan.format==='png'){reportProgress(request.onProgress,{phase:'first-frame'});
   const frame=await session.renderFrame(plan.start,{signal:request.signal});request.signal?.throwIfAborted();await writeFile(output,frame.png);
   return {output,plan,width,height,diagnostics:[...plan.diagnostics,...frame.diagnostics]};
  }
  encoder=plan.format==='mov'?await ProfessionalVideoEncoder.create(output,{...defaultVideo,alpha:{mode:'flatten',matte:[0,0,0]},...request.audio?.video,width,height,fps:c.fps}):await VideoEncoder.create(output,c.fps,width,height);
  const diagnostics=[...plan.diagnostics],generation=session.status().generation;
  reportProgress(request.onProgress,{phase:'first-frame',completed:0,total:plan.frames});
  for(let frame=plan.start;frame<plan.end;frame++){
   request.signal?.throwIfAborted();
   if(encoder instanceof ProfessionalVideoEncoder){const rendered=await session.mediaFrame(frame);diagnostics.push(...rendered.diagnostics);await encoder.write(rendered.surface);}
   else {const rendered=await session.renderFrame(frame,{signal:request.signal});diagnostics.push(...rendered.diagnostics);await encoder.write(rendered.png);}
   reportProgress(request.onProgress,{phase:'render',completed:frame-plan.start+1,total:plan.frames});
   if(session.status().generation!==generation)throw new EngineError('E_CREATION_CHANGED','Project changed during output; the previous plan is no longer valid.');
  }
  request.signal?.throwIfAborted();reportProgress(request.onProgress,{phase:'finalize'});await encoder.finish();encoder=undefined;
  return {output,plan,frames:plan.frames,diagnostics};
 }finally{request.signal?.removeEventListener('abort',cancel);await encoder?.abort();await session.close();}
}
