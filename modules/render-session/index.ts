import {StageCaller,withExecutionOwner,isExecutionOwner,type CallHost,type Ports,type StageRef,type RunOptions,type RunResult} from '../stage-orchestration/index.ts';
import {audioProjectInfo,mixAudioLayers} from '../../src/audio/layers.ts';
import {assertInterval,type SampleInterval} from '../../src/audio/time.ts';
import type {AudioSampleRate} from '../../src/audio/block.ts';
import {audioResourceOptions,type AudioResourceOptions} from '../../src/audio/resource-options.ts';
import {assertMediaPolicy,type MediaPolicy,type ProfessionalFrame} from '../../src/media/compositor.ts';
import {mkdir,mkdtemp} from 'node:fs/promises';
import {runtimeCachePath} from '../../src/runtime/paths.ts';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {AsyncResource} from 'node:async_hooks';
import type {BuiltProject,RenderedFrame} from '../../src/core/types.ts';
import {EngineError,diagnostic} from '../../src/core/errors.ts';
import {buildProject} from '../../src/compiler/build.ts';
import {Renderer,type RendererOptions} from '../../src/render/renderer.ts';
import {nativeExecutable} from '../native-gpu/executable.ts';
import {measure,type PerformanceSink} from '../../src/render/performance.ts';
import {inspectProject} from '../render-inspection/inspect.ts';
import type {InspectOptions,InspectionReport} from '../render-inspection/types.ts';
import {catalog,dependencies,fingerprint} from './dependencies.ts';
import {plain} from '../render-inspection/common.ts';
import {SharedSessionAdapter} from '../shared-state/session-adapter.ts';
import type {SharedCommit} from '../shared-state/coordinator.ts';
import type {Variable,Value} from '../shared-state/protocol.ts';

export interface RenderSessionOptions extends Pick<InspectOptions,'width'|'height'|'mode'|'cache'|'allowWasm'|'timeoutMs'> {audioResources?:AudioResourceOptions;onProfile?:PerformanceSink;media?:MediaPolicy;nativeGpu?:Pick<NonNullable<RendererOptions['nativeGpu']>,'maxBytes'|'resourceLimits'|'rayQuery'|'logicLimits'>&{executable?:string};}
export interface SessionInspection extends Pick<InspectOptions,'output'|'frames'|'times'|'storyboard'|'stageId'> {signal?:AbortSignal}
export interface SessionFrameOptions {signal?:AbortSignal;stageId?:string}
export type SessionFrame=RenderedFrame&{shared?:SharedCommit};
type FrameOutputs={png:RenderedFrame;media:ProfessionalFrame;data:Awaited<ReturnType<Renderer['evaluateFrame']>>};
const environment=()=>JSON.stringify([process.env.FRAMEWEAVE_HOME,process.env.FRAMEWEAVE_JS_HOST,process.env.FRAMEWEAVE_SPIDERMONKEY,process.env.FRAMEWEAVE_NATIVE_GPU,process.env.FRAMEWEAVE_SERVO_RUNTIME,process.env.FRAMEWEAVE_MEDIA_PYTHON,process.env.FRAMEWEAVE_MEDIA_VIPS,process.env.FRAMEWEAVE_FFMPEG,process.env.FRAMEWEAVE_FFPROBE]);
const error=(code:string,message:string)=>new EngineError(code,message);

/** One compiler seal, queue, Renderer and transaction owner for SDR, HDR and data. */
export class RenderSession {
  readonly id=randomUUID();readonly project:string;
  private readonly policy:RenderSessionOptions;private readonly hostEnvironment=environment();
  private tail:Promise<unknown>=Promise.resolve();private closing?:Promise<void>;private interruption?:Promise<void>;
  private accepting=true;private stopped=false;private cancelled=false;
  private build?:BuiltProject;private files:string[]=[];private signature?:string;private trust?:string;
  private renderer?:Renderer;private starting?:Promise<Renderer>;private rendererAudioOnly=false;
  private builds=0;private hostStarts=0;private generation=0;private invalidations=0;
  private shared=new SharedSessionAdapter(this.id);
  private callAttempts=0;
  private callHost:CallHost={id:this.id,nextCallId:()=>this.id+':'+(++this.callAttempts),enqueueCall:(run,signal)=>this.withSignal(signal,async()=>{
    const build=await this.prepare(),seal=this.signature,renderer=await this.acquire(build);
    const validateSeal=async()=>{await this.prepare();if(this.build!==build||this.signature!==seal)throw error('E_STAGE_CALL_ENV_CHANGED','Sources, resources or policy changed during Stage call');};
    try{return await run({build,shared:this.shared,assertActive:()=>this.active(),validateSeal,markExecuted:()=>{},invoke:async(stage,context,inputs,props)=>{
      this.active();if(!renderer.status().connected)throw error('E_RENDERER_DISCONNECTED','Backend disconnected');
      const execution=typeof props.vSharedRuntime==='string'?{stageProps:{[stage.id]:{vSharedRuntime:props.vSharedRuntime}}}:undefined;
      return renderer.runStage(stage.id,context.globalFrame,inputs,execution);
    }});}catch(e){
      if(this.stopped)throw this.closedError();
      let failure=e;
      if((!renderer.status().connected||e instanceof Error&&/Target (?:page, context or browser|closed).*closed|Target closed/i.test(e.message))&&!(e instanceof EngineError&&e.code==='E_STAGE_TIMEOUT'))failure=new EngineError('E_RENDERER_DISCONNECTED','Stage call backend disconnected',{details:{cause:diagnostic(e)}});
      if(renderer.status().initializationFailed||failure instanceof EngineError&&['E_STAGE_TIMEOUT','E_STAGE_INIT','E_STAGE_IMPORT','E_RENDERER_DISCONNECTED','E_AUDIO_WORKER_CLOSED'].includes(failure.code)){this.shared.invalidate();await this.retire();}
      throw failure;
    }
  })};
  private stageCaller=new StageCaller(this.callHost);
  run<I extends Ports,O extends Ports>(stage:StageRef<I,O>,options:RunOptions<I>):Promise<RunResult<O>>;
  run(stage:string,options?:RunOptions):Promise<RunResult>;
  run(stage:any,options:any={}){return this.stageCaller.run(stage,options);}
  constructor(project:string,options:RenderSessionOptions={}){
    if(typeof project!=='string'||!project)throw error('E_ARGUMENT','A project entry is required');
    const media=options?.media;
    const allowed=['width','height','mode','cache','allowWasm','timeoutMs','onProfile','media','nativeWindow','nativeGpu','audioResources'];
    if(!plain(options)||Object.keys(options).some(k=>!allowed.includes(k)))throw error('E_ARGUMENT','Unknown render session policy field');
    this.project=resolve(project);if(media)assertMediaPolicy(media);
    if(options.nativeGpu&&(!plain(options.nativeGpu)||Object.keys(options.nativeGpu).some(k=>!['executable','maxBytes','resourceLimits','rayQuery','logicLimits'].includes(k))))throw error('E_ARGUMENT','Unknown Native session policy field');
    this.policy=Object.freeze({...options,...options.audioResources?{audioResources:audioResourceOptions(options.audioResources)}:{},...options.nativeGpu?{nativeGpu:structuredClone(options.nativeGpu)}:{},...media?{media:structuredClone(media)}:{}});
  }
  private get isShared(){return this.shared.status().enabled;}
  private closedError(){return error(this.cancelled?'E_RENDER_CANCELLED':'E_RENDER_SESSION_CLOSED',this.cancelled?'Render session was cancelled':'Render session is closed');}
  private active(){
    if(this.stopped)throw this.closedError();
    if(environment()!==this.hostEnvironment){this.shared.invalidate();throw error(this.isShared?'E_SHARED_SESSION_REOPEN':'E_RENDER_SESSION_POLICY','The host environment changed; open a new session to review its policy');}
  }
  private enqueue<T>(run:()=>Promise<T>):Promise<T>{
    if(!this.accepting)return Promise.reject(this.closedError());
    if(isExecutionOwner(this.callHost))return Promise.reject(error('E_STAGE_CALL_REENTRANT','Cannot re-enter the owning Session queue'));
    const task=this.tail.then(()=>withExecutionOwner(this.callHost,run));this.tail=task.catch(()=>{});return task;
  }
  private async retire(){const r=this.renderer;this.renderer=undefined;this.rendererAudioOnly=false;if(r)await r.close();}
  private async prepare():Promise<BuiltProject>{
    try{
      this.active();const state=await catalog(this.project);
      if(this.trust!==undefined&&this.trust!==state.trust)throw error('E_RENDER_SESSION_POLICY','Package trust changed; open a new session after reviewing the new permissions');
      this.trust=state.trust;
      if(this.build){
        const current=await measure(this.policy.onProfile,'session.validate',()=>fingerprint(this.files,state.signature));
        if(current===this.signature){this.shared.bind(this.build,current);return this.build;}
        this.invalidations++;
        if(this.isShared)throw error('E_SHARED_SESSION_REOPEN','Shared source, resources or locks changed; reopen Session');
        await this.retire();this.build=undefined;
      }
      const parent=runtimeCachePath('render-sessions');await mkdir(parent,{recursive:true});const dir=await mkdtemp(join(parent,'build-'));
      const build=await measure(this.policy.onProfile,'session.build',()=>buildProject(this.project,{outputDir:dir,timeoutMs:this.policy.timeoutMs,onProfile:this.policy.onProfile}));
      this.active();this.files=await dependencies(this.project,build);const after=await catalog(this.project);
      if(after.signature!==state.signature)throw error('E_RENDER_SESSION_CHANGED','Module dependencies changed during compilation; retry with stable inputs');
      this.signature=await fingerprint(this.files,state.signature);this.shared.bind(build,this.signature);
      this.build=build;this.builds++;this.generation++;return build;
    }catch(e){
      const shared=this.isShared;if(shared)this.shared.invalidate();this.build=undefined;await this.retire();
      if(this.stopped)throw this.closedError();
      if(shared&&!(e instanceof EngineError&&e.code.startsWith('E_SHARED_')))throw new EngineError('E_SHARED_SESSION_REOPEN','Shared environment validation failed; reopen Session',{details:{cause:diagnostic(e)}});
      throw e;
    }
  }
  private async acquire(build:BuiltProject,options?:RendererOptions,audioOnly=false){
    this.active();
    if(this.renderer&&this.rendererAudioOnly&&!audioOnly)await this.retire();
    if(!options&&audioOnly){const {nativeGpu:_native,...policy}=this.policy;options={...policy};}
    if(!options){
      const c=build.manifest.composition,width=this.policy.width??(this.policy.height?Math.round(c.width*this.policy.height/c.height):this.policy.mode==='preview'?Math.min(640,c.width):c.width),height=this.policy.height??Math.round(c.height*width/c.width);
      const native=build.manifest.stages.some(s=>s.engine==='native-gpu');
      options={...this.policy,width,height,preview:this.policy.mode==='preview',nativeGpu:native?{...this.policy.nativeGpu,executable:await nativeExecutable(this.policy.nativeGpu?.executable),dynamic:'throughput',slots:1,readback:'final-surface'}:undefined};
    }
    if(this.renderer&&!this.renderer.status().connected){
      if(this.isShared){this.shared.invalidate();await this.retire();throw error('E_SHARED_SESSION_REOPEN','Shared backend disconnected; reopen Session');}
      await this.retire();
    }
    if(!this.renderer){
      this.starting=audioOnly?Renderer.createAudio(build,options):Renderer.create(build,options);
      this.rendererAudioOnly=audioOnly;
      try{this.renderer=await this.starting;this.hostStarts++;}finally{this.starting=undefined;}
      if(this.stopped){await this.retire();this.active();}
    }
    return this.renderer!;
  }
  private async frame<K extends keyof FrameOutputs>(frame:number,kind:K,stageId?:string,renderer?:Renderer):Promise<FrameOutputs[K]&{shared?:SharedCommit}>{
    const build=renderer&&!this.isShared?this.build!:await this.prepare();
    if(kind==='media'&&!this.policy.media)throw error('E_MEDIA_POLICY','Open the session with an explicit media policy');
    if(this.isShared&&stageId!==undefined)throw error('E_SHARED_PARTIAL_RENDER','Shared transactions require the whole composition');
    const r=renderer??await this.acquire(build);
    try{return await this.shared.render(frame,async execution=>{
      this.active();
      if(!r.status().connected)throw error('E_RENDERER_DISCONNECTED','Renderer disconnected; this frame was not retried');
      try{
        const result=kind==='media'?await r.renderMediaFrame(frame,stageId,execution):kind==='data'?await r.evaluateFrame(frame,stageId,execution):await r.renderFrame(frame,stageId,execution);
        this.active();
        // Validate the same source/trust seal AFTER output validation/composition.
        // The adapter then performs its atomic commit without another await.
        if(this.isShared)await this.prepare();
        return result as FrameOutputs[K];
      }catch(e){
        if(this.stopped)throw this.closedError();
        if((!r.status().connected||e instanceof Error&&/Target (?:page, context or browser|closed).*closed|Target closed/i.test(e.message))&&!(e instanceof EngineError&&e.code==='E_STAGE_TIMEOUT'))throw new EngineError('E_RENDERER_DISCONNECTED','Renderer closed or disconnected; request a new backend',{frame,stageId:e instanceof EngineError?e.stageId??stageId:stageId,details:{cause:diagnostic(e)}});
        throw e;
      }
    },{assertActive:()=>this.active()},stageId);}catch(e){
      if(r.status().initializationFailed||e instanceof EngineError&&['E_STAGE_TIMEOUT','E_STAGE_INIT','E_STAGE_IMPORT','E_RENDERER_DISCONNECTED'].includes(e.code)){this.shared.invalidate();await this.retire();}
      throw e;
    }
  }
  private withSignal<T>(signal:AbortSignal|undefined,run:()=>Promise<T>):Promise<T>{
    if(signal!==undefined&&!(signal instanceof AbortSignal))return Promise.reject(error('E_ARGUMENT','signal must be an AbortSignal'));
    const abort=()=>{void this.cancel().catch(()=>{});};signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
    return this.enqueue(run).finally(()=>signal?.removeEventListener('abort',abort));
  }
  private raw<K extends keyof FrameOutputs>(frame:number,kind:K,options:SessionFrameOptions={}){
    if(!plain(options)||Object.keys(options).some(k=>!['signal','stageId'].includes(k))||options.stageId!==undefined&&typeof options.stageId!=='string')return Promise.reject(error('E_ARGUMENT','Invalid frame options'));
    const {signal,stageId}:SessionFrameOptions=options;return this.withSignal(signal,()=>this.frame(frame,kind,stageId));
  }
  renderFrame(frame:number,options:SessionFrameOptions={}):Promise<SessionFrame>{return this.raw(frame,'png',options);}
  evaluateFrame(frame:number,options:SessionFrameOptions={}):Promise<Awaited<ReturnType<Renderer['evaluateFrame']>>&{shared?:SharedCommit}>{return this.raw(frame,'data',options);}
  mediaFrame(frame:number,stageId?:string):Promise<ProfessionalFrame&{shared?:SharedCommit}>{return this.raw(frame,'media',{stageId});}
  describeAudio(rate:AudioSampleRate){return this.enqueue(async()=>{const build=await this.prepare();if(this.isShared)throw error('E_AUDIO_SHARED_INTERVAL','Audio intervals are not shared frame transactions');return audioProjectInfo(build.manifest,rate);});}
  evaluateInterval(interval:SampleInterval,options:SessionFrameOptions={}){
    const snapshot=structuredClone(interval);assertInterval(snapshot);const stageId=options.stageId;return this.withSignal(options.signal,async()=>{const build=await this.prepare();if(this.isShared)throw error('E_AUDIO_SHARED_INTERVAL','Audio intervals require a stateless project');const seal=this.signature,renderer=await this.acquire(build,undefined,true);try{const result=await renderer.evaluateInterval(snapshot,stageId);this.active();await this.prepare();if(seal!==this.signature)throw error('E_RENDER_SESSION_CHANGED','Audio inputs changed during execution');return result;}catch(e){if(this.stopped)throw this.closedError();if(e instanceof EngineError&&['E_STAGE_TIMEOUT','E_AUDIO_WORKER_CLOSED'].includes(e.code))await this.retire();throw e;}});
  }
  mixAudio(interval:SampleInterval,options:{layout:'mono'|'stereo';signal?:AbortSignal}){
    const snapshot=structuredClone(interval);assertInterval(snapshot);const layout=options.layout;return this.withSignal(options.signal,async()=>{const build=await this.prepare();if(this.isShared)throw error('E_AUDIO_SHARED_INTERVAL','Audio mixing does not publish shared frame state');const seal=this.signature,renderer=await this.acquire(build,undefined,true);try{const result=await mixAudioLayers(build.manifest,snapshot,{layout,gap:'silence',evaluate:(request,stageId)=>renderer.evaluateInterval(request,stageId)});this.active();await this.prepare();if(seal!==this.signature)throw error('E_RENDER_SESSION_CHANGED','Audio inputs changed during mixing');return result;}catch(e){if(this.stopped)throw this.closedError();if(e instanceof EngineError&&['E_STAGE_TIMEOUT','E_AUDIO_WORKER_CLOSED'].includes(e.code))await this.retire();throw e;}});
  }
  nativeStats(){return this.enqueue(async()=>{const build=await this.prepare();return (await this.acquire(build)).nativeStats();});}
  readShared<T extends Value>(variable:Variable<T>){return this.enqueue(async()=>{await this.prepare();return this.shared.read(variable);});}
  status(){return {id:this.id,accepting:this.accepting,cancelled:this.cancelled,closed:this.stopped,generation:this.generation,builds:this.builds,hostStarts:this.hostStarts,shared:this.shared.status()};}
  describe(){return this.enqueue(async()=>{const build=await this.prepare();return {hash:build.hash,composition:structuredClone(build.manifest.composition)};});}
  inspect(request:SessionInspection={}):Promise<InspectionReport>{
    if(!plain(request)||Object.keys(request).some(k=>!['output','frames','times','storyboard','stageId','signal'].includes(k)))return Promise.reject(error('E_ARGUMENT','A request cannot change its session project or rendering policy'));
    const {signal,...rest}:SessionInspection=request;
    if(signal!==undefined&&!(signal instanceof AbortSignal))return Promise.reject(error('E_ARGUMENT','signal must be an AbortSignal'));
    const copy={...rest,...Array.isArray(rest.frames)?{frames:[...rest.frames]}:{},...Array.isArray(rest.times)?{times:[...rest.times]}:{}};
    const run=()=>{
      let reused=false;
      return inspectProject({...this.policy,...copy,project:this.project},{onProfile:this.policy.onProfile,prepare:()=>this.prepare(),acquire:async(build,options)=>{
        if(this.isShared&&copy.stageId!==undefined)throw error('E_SHARED_PARTIAL_RENDER','Shared transactions require the whole composition');
        reused=!!this.renderer;const r=await this.acquire(build,{...options,audioResources:this.policy.audioResources});let lost=false;
        return {renderFrame:async(frame,stageId)=>{if(lost)throw new EngineError('E_RENDERER_DISCONNECTED','Renderer disconnected; this batch was not retried',{frame,stageId});try{return await this.frame(frame,'png',stageId,r);}catch(e){if(e instanceof EngineError&&e.code==='E_RENDERER_DISCONNECTED')lost=true;throw e;}},close:async()=>{if(r.status().initializationFailed||!r.status().connected)await this.retire();}};
      },finish:report=>{report.session={id:this.id,generation:this.generation,builds:this.builds,hostStarts:this.hostStarts,hostReused:reused,invalidations:this.invalidations};}});
    };
    if(!this.accepting)return inspectProject({...this.policy,...copy,project:this.project},{prepare:async()=>{throw this.closedError();}});
    return this.withSignal(signal,run);
  }
  renderFrames(frames:number[],request:Omit<SessionInspection,'frames'|'times'>={}){return this.inspect({...request,frames});}
  refresh(){return this.enqueue(async()=>{this.active();if(this.isShared){this.shared.invalidate();await this.retire();throw error('E_SHARED_SESSION_REOPEN','Shared refresh requires an explicit new Session');}await this.retire();this.build=undefined;this.invalidations++;});}
  private async release(){
    const failures:unknown[]=[];try{await this.retire();}catch(e){failures.push(e);}
    try{await this.starting;}catch{/* Creation owns partial cleanup. */}
    try{await this.retire();}catch(e){failures.push(e);}if(failures.length)throw failures[0];
  }
  /** Terminal and immediate, including while graceful close is already waiting. */
  cancel(){
    this.accepting=false;this.cancelled=true;this.stopped=true;this.shared.invalidate('E_RENDER_CANCELLED','Session cancelled');
    this.interruption??=this.release();void this.interruption.catch(()=>{});return this.close();
  }
  /** Drain accepted operations; new calls fail. Renderer.close remains immediate. */
  close():Promise<void>{
    this.accepting=false;if(this.closing)return this.closing;
    this.closing=(async()=>{try{await this.tail;}finally{this.stopped=true;try{await (this.interruption??this.release());}finally{this.build=undefined;this.shared.dispose();}}})();return this.closing;
  }
}
export async function openRenderSession(project:string,options:RenderSessionOptions={}):Promise<RenderSession>{return new RenderSession(project,options);}
export type {PerformanceEvent,PerformanceSink} from '../../src/render/performance.ts';
export type {SharedCommit} from '../shared-state/coordinator.ts';
