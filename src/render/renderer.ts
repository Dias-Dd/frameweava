import type {NativeStateSegment} from '../../modules/native-gpu/state-segments.ts';
import {NativeGpuClient,type NativePreviewEvents, type NativeFrameTicket} from '../../modules/native-gpu/client.ts';
import {compileNativePlan,nativeParameters,nativePresentationTarget,type NativePlan} from '../../modules/native-gpu/program.ts';
import type {NativeResourceOptions} from '../../modules/native-gpu/resource-images.ts';
import {NativeLogicHost} from '../../modules/native-gpu/logic-host.ts';
import {nativeHostPolicy} from '../../modules/spidermonkey-host/policy.ts';
import {configureNativeDisplay} from '../../modules/native-gpu/display.ts';
import {PreviewSegments} from '../../modules/native-gpu/preview-segments.ts';
import {packNativeF16Intermediates} from '../../modules/native-gpu/packed-images.ts';
import {nativeFrameCapacity} from '../../modules/native-gpu/memory.ts';
import type {NativeFrameBindings} from '../../modules/native-gpu/client.ts';
import {nativeExtensionLayout} from '../../modules/native-gpu/extensions.ts';
import {NativeBufferExporter,type NativeBufferValue} from '../../modules/native-gpu/data-export.ts';
import type {NativeProgram} from '../../modules/native-gpu/client.ts';
import {nativeBootstrapProgram} from '../../modules/native-gpu/bootstrap-program.ts';
import {previewQualityOptions,type PreviewQuality} from '../../modules/native-gpu/preview-quality.ts';
import {CONFIG,RUNTIME,definition,runtime} from '../shared-state/protocol.ts';
import type {IntervalRequest} from '../audio/contract.ts';
import type {FrameContext} from '../core/types.ts';
import {fieldInfo} from '../../modules/gpu-effects/compute-contract.ts';
import {samePixelColor} from '../../modules/gpu-effects/pixel-shader.ts';
import {surfaceFromPixels} from '../media/surface.ts';
import {isProfessionalSurface} from '../media/surface.ts';
import {assertSurfaceSampleRange} from './surface-validation.ts';
import {composeMediaFrame,mediaPreview,expandLegacySurface} from '../media/node.ts';
import {assertMediaPolicy,type ProfessionalFrame} from '../media/compositor.ts';
import {AudioAdapter} from '../audio/adapter.ts';
import {audioExecutionStages} from '../audio/execution-stages.ts';
import {audioResourceOptions} from '../audio/resource-options.ts';
import {layersForMedia} from '../core/output-plan.ts';
import {isAudioBlock,isAudioDescriptor,assertAudioBlock} from '../audio/block.ts';
import {stageAudioRequest,renderStageInterval,intervalFrame} from '../audio/execution.ts';
import {assertInterval,type SampleInterval} from '../audio/time.ts';
import {frameToSample} from '../audio/time.ts';
import { existsSync } from 'node:fs';
import {randomBytes} from 'node:crypto';
import { platform, arch } from 'node:os';
import sharp from 'sharp';
import type { BuiltProject, Diagnostic, PortType, PortValue, RenderedFrame, RenderOptions, PreviewFrame, StageAdapter, StageFrameResult, StageSpec, Surface } from '../core/types.ts';
import { EngineError, diagnostic } from '../core/errors.ts';
import { evaluate } from '../core/animation.ts';
import { assertValidTVG, topologicalLevels } from '../core/graph.ts';
import { compositionContext, frameContext, isActive } from '../core/time.ts';
import {assertWasmOption,assertNativeExecution} from '../runtime/execution-policy.ts';
import {linear709,srgb} from '../media/surface.ts';
import { MockAdapter } from './mock-adapter.ts';
import { hashValue, StageCache,ValueCache,cloneMediaValue } from './cache.ts';
import type {ProfessionalSurface} from '../media/surface.ts';
import { assertStageInputs } from '../core/ports.ts';
import {measure,type PerformanceSink} from './performance.ts';
import {captureFrameExecution,frameStageProps,type FrameExecution} from './frame-execution.ts';
import {stageDefinitions} from '../../modules/stage-orchestration/composite-types.ts';
import {assertSharedExecution} from '../../modules/shared-state/execution-host.ts';
import {OcioWorker} from '../media/ocio-worker.ts';
export type {FrameExecution} from './frame-execution.ts';

function nativePlanCacheable(p:NativeProgram){
  return p.version===2&&!p.frameContinuation&&!p.stateContinuation&&!p.rayQuery&&
    !p.modules?.length&&!p.inferences?.length&&!p.imports?.length&&!p.resourceLease&&!p.export&&!p.mediaExport&&
    !p.data?.some(d=>d.persistent||d.resident||d.sourceResource)&&!p.passes.some(pass=>pass.draw||pass.rayBuild||pass.rayQuery!==undefined);
}

export interface NativePreviewCheckpoint {readonly bytes:number}
export interface RendererOptions extends RenderOptions {onProfile?:PerformanceSink;
 /** Explicit experimental native backend. Never executes arbitrary Web factories in Node. */
 nativeGpu?:{previewQuality?:true;packedF16?:boolean;graphTemplates?:boolean;logicLimits?:{maxMessageBytes?:number;maxMemoryBytes?:number};resourceLimits?:Omit<NativeResourceOptions,'allowWasm'>;rayQuery?:boolean;executable:string;window?:boolean;slots?:number;maxBytes?:number;dynamic?:'interactive'|'throughput';readback?:'final-surface';mediaExport?:Omit<import('../../modules/native-gpu/media-export.ts').NativeMediaExport,'image'|'alpha'>;export?:Omit<NonNullable<NativeProgram['export']>,'image'|'display'>};
}
/** Prepared output projection is engine-owned; never a value-cache entry or PortValue. */
export interface PreparedPresentation {diagnostics:Diagnostic[];stageOutputs:Record<string,Record<string,PortValue>>;cacheHits:number}


export interface AdapterEnvironment { build:BuiltProject; options:RenderOptions }
export type AdapterFactory=(environment:AdapterEnvironment)=>StageAdapter|Promise<StageAdapter>;
/** Explicit units prevent an unqualified number from meaning either frames or seconds. */
export type RenderPosition={frame:number;time?:never}|{time:number;frame?:never};
const customAdapters=new Map<string,AdapterFactory>();
const ref=(value:unknown):value is {$ref:string;port:string}=>Boolean(value && typeof value==='object' && '$ref' in value && 'port' in value);
const surface=(value:unknown):value is Surface=>Boolean(value && typeof value==='object' && (value as Surface).kind==='surface' && (value as Surface).format==='png');

function json(value:unknown,seen=new Set<object>()):boolean {
  if(value===null || typeof value==='string' || typeof value==='boolean')return true;
  if(typeof value==='number')return Number.isFinite(value);
  if(typeof value!=='object' || !value || seen.has(value))return false;
  seen.add(value);
  const valid=Array.isArray(value)?value.every(item=>json(item,seen)):Object.getPrototypeOf(value)===Object.prototype && Object.values(value).every(item=>json(item,seen));
  seen.delete(value);return valid;
}
function validValue(value:unknown,type:PortType):boolean {
  if(type==='audio'){if(!isAudioBlock(value))return false;assertAudioBlock(value);return true;}
  if(type==='json'&&isAudioDescriptor(value))return false;
  if(type==='surface'&&isProfessionalSurface(value)){assertSurfaceSampleRange(value);return true;}
  if(type==='json'&&isProfessionalSurface(value))return false;
  if(type==='surface')return surface(value) && value.format==='png' && Number.isInteger(value.width) && value.width>0 && Number.isInteger(value.height) && value.height>0 && typeof value.dataUrl==='string' && value.dataUrl.startsWith('data:image/png;base64,');
  if(type==='json')return json(value);
  return typeof value===type && (type!=='number' || Number.isFinite(value));
}
async function validateResult(stage:StageSpec,result:StageFrameResult) {
  if(!result || !result.outputs || typeof result.outputs!=='object')throw new EngineError('E_OUTPUT_FORMAT',`Stage ${stage.id} returned invalid outputs.`,{stageId:stage.id});
  for(const [port,type]of Object.entries(stage.outputs)){
    const value=result.outputs[port];
    if(!validValue(value,type))throw new EngineError('E_OUTPUT_TYPE',`Stage ${stage.id}.${port} must return ${type}.`,{stageId:stage.id,details:{port,expected:type,actual:typeof value}});
    if(surface(value)){
      const metadata=await sharp(Buffer.from(value.dataUrl.split(',')[1],'base64')).metadata();
      if(metadata.width!==value.width || metadata.height!==value.height || metadata.format!=='png')throw new EngineError('E_OUTPUT_SIZE',`Stage ${stage.id}.${port} PNG dimensions do not match the surface descriptor.`,{stageId:stage.id,details:{descriptor:{width:value.width,height:value.height},actual:{width:metadata.width,height:metadata.height}}});
    }
  }
  for(const port of Object.keys(result.outputs))if(!stage.outputs[port])throw new EngineError('E_OUTPUT_UNDECLARED',`Stage ${stage.id} returned undeclared output ${port}.`,{stageId:stage.id});
}

/** Owns isolated native runtimes, a level-parallel DAG scheduler, bounded cache and RGBA compositor. */
export class Renderer {
  private nativeContinuation?:{name:string;frame:number};private nativeContinuationFailure?:EngineError;
  private stateSegmentCount=0;private stateSegmentFrames=0;private stateSegmentRollbacks=0;
  private async executeNativeStateSegment(segment:NativeStateSegment,signal?:AbortSignal){
    if(this.nativeContinuationFailure)throw this.nativeContinuationFailure;
    if(!this.nativeClient||!this.nativePlan)throw new EngineError('E_NATIVE_SEGMENT_UNAVAILABLE','An admitted native owner is required');
    if(signal?.aborted)throw new EngineError('E_RENDER_CANCELLED','State segment cancelled before execution');
    if(this.nativeContinuation&&this.nativeContinuation.frame!==segment.frame)throw new EngineError('E_NATIVE_SEGMENT_FRAME','One frame owns this continuation');
    const p=segment.program;p.session=this.nativeClient.program.session;p.maxBytes=this.options.nativeGpu?.maxBytes??1024**3;p.rayQuery=this.options.nativeGpu?.rayQuery?true:undefined;
    await Promise.all([...this.nativePending]);this.nativeLayout=undefined;this.nativeBufferExporter?.configure(p);
    await this.nativeClient.reconfigure(p);this.nativePlan.program=p;
    if(!this.nativeContinuation){const name='frame-'+segment.frame+'-'+Math.random().toString(36).slice(2);await this.nativeClient.stateCheckpoint('save-continuation',name);this.nativeContinuation={name,frame:segment.frame};}
    const ticket=await this.nativeClient.submit(segment.frame,segment.parameters,{signal});await ticket.completed;this.stateSegmentCount++;
  }
  private async finishNativeStateContinuation(commit:boolean){
    const t=this.nativeContinuation;if(!t||!this.nativeClient)return;this.nativeContinuation=undefined;
    try{if(!commit){await this.nativeClient.stateCheckpoint('restore',t.name);this.stateSegmentRollbacks++;}else this.stateSegmentFrames++;}
    finally{await this.nativeClient.stateCheckpoint('release',t.name);this.nativeLayout=undefined;}
  }
  private async failNativeStateContinuation(error:unknown):Promise<never>{
    let rollback:unknown;try{await this.finishNativeStateContinuation(false);}catch(e){rollback=e;}
    this.nativeContinuationFailure=new EngineError('E_NATIVE_SEGMENT_FAILED','Segmented frame aborted; reopen this Renderer because ordinary JavaScript state is not rewindable',{details:{cause:error instanceof EngineError?{code:error.code,message:error.message}:String(error),rollback:rollback?String(rollback):'GPU managed state restored'}});
    if(rollback)throw this.nativeContinuationFailure;throw error;
  }

  private nativeClient?:NativeGpuClient;
  private previewReplacement=false;
  private nativeBufferExporter?:NativeBufferExporter;
  private nativePending=new Set<Promise<unknown>>();
  private nativePlan?:NativePlan;
  private nativeLogic?:NativeLogicHost;private nativeLayout?:string;private nativeFrameLayout?:string;private nativeFrameDeltas=false;private nativePlanCache=new Map<string,number>();private nativePlanSequence=0;private nativeOutputInfo?:NativeProgram['images'][number];
  private preparedNative?:{frame:number;executionKey:string;result:Awaited<ReturnType<NativeLogicHost['record']>>};
  private nativeValues=new WeakMap<NativeFrameTicket,Record<string,Record<string,PortValue>>>();
  private nativeAbort=new AbortController();
  private nativeKernelKeys=new Map<string,Map<string,number>>();private nativeResourceKeys=new WeakMap<object,number>();private nextNativeKey=0;
  private adapters=new Map<string,StageAdapter>();
  private initializationErrors=new Map<string,EngineError>();
  private initializedStages=new Set<string>();
  private cache=new StageCache();
  private callEpochs=new Map<string,number>();
  private mediaCache=new ValueCache<{surface:ProfessionalSurface;diagnostics:Diagnostic[]}>();
  private previewCache=new ValueCache<{png:Buffer;diagnostics:Diagnostic[]}>(32*1024*1024);
  private ocioWorker=new OcioWorker();
  private queue:Promise<unknown>=Promise.resolve();
  private closed=false;
  private closing?:Promise<void>;
  private fingerprint='';
  private readonly previewSegments?:PreviewSegments;
  private previewCheckpointEligible:boolean;
  private previewCheckpointSequence=0;
  private previewCheckpoints=new WeakMap<NativePreviewCheckpoint,{name:string;logic:import('../../modules/native-gpu/logic-host.ts').NativePreviewLogicState}>();
  private constructor(private build:BuiltProject,private options:RendererOptions,private width:number,private height:number,private audioOnly=false){
    this.previewCheckpointEligible=options.cache!==false&&options.nativeGpu?.window===true&&
      !options.nativeGpu.export&&!options.nativeGpu.mediaExport&&!options.nativeGpu.readback&&build.manifest.resources.length===0&&
      stageDefinitions(build.manifest).every(({stage})=>!Object.hasOwn(stage.props,CONFIG));
    const cacheNativePreview=options.cache!==false&&options.nativeGpu?.window===true&&options.nativeGpu.dynamic==='interactive'&&
      !options.nativeGpu.export&&!options.nativeGpu.mediaExport&&!options.nativeGpu.readback&&!options.nativeGpu.rayQuery&&build.manifest.resources.length===0&&
      build.manifest.stages.length>0&&build.manifest.stages.every(s=>s.engine==='native-gpu'&&s.seek==='stateless'&&
        !s.entry&&!s.nodes&&!s.composition&&!Object.hasOwn(s.props,CONFIG)&&s.props.nativeCache==='deterministic-v1'&&!!s.props.nativePixel);
    if(cacheNativePreview)this.previewSegments=new PreviewSegments(build.manifest);
  }
  static registerAdapter(engine:string,factory:AdapterFactory){customAdapters.set(engine,factory);}
  static async create(build:BuiltProject,options:RendererOptions={}):Promise<Renderer>{return this.createForExecution(build,options,false);}
  /** Same Renderer, full compiler seal; initialize only the audio dependency closure. */
  static async createAudio(build:BuiltProject,options:RendererOptions={}):Promise<Renderer>{
    if(options.nativeGpu)throw new EngineError('E_AUDIO_OPTIONS','Audio-only initialization does not accept Native image options');
    return this.createForExecution(build,options,true);
  }
  private static async createForExecution(build:BuiltProject,options:RendererOptions,audioOnly:boolean,replacement?:NativeGpuClient):Promise<Renderer>{
    if(options.audioResources)options={...options,audioResources:audioResourceOptions(options.audioResources)};
    assertWasmOption(options.allowWasm);
    if(Object.hasOwn(options,'executablePath')||Object.hasOwn(options,'presentationWindow'))throw new EngineError('E_WEB_REMOVED','Browser executable/window options were removed; use nativeGpu.window.');
    if(options.media)assertMediaPolicy(options.media);
    if(options.media?.previewCompute&&!options.preview)throw new EngineError('E_MEDIA_PREVIEW_POLICY','Proxy computation is only allowed in explicit preview mode');
    if(options.media)options={...options,media:structuredClone(options.media)};
    assertValidTVG(build.manifest);
    assertNativeExecution(build.manifest.stages);
    const stages=audioOnly?audioExecutionStages(build.manifest):build.manifest.stages;
    const c=build.manifest.composition;
    const width=options.width ?? (options.height?Math.round(c.width*options.height/c.height):c.width);
    const height=options.height ?? Math.round(c.height*width/c.width);
    if(!Number.isInteger(width) || !Number.isInteger(height) || width<1 || height<1)throw new EngineError('E_OUTPUT_SIZE','Output dimensions must be positive integers.');
    if(Math.abs(width/height-c.width/c.height)>0.003)throw new EngineError('E_OUTPUT_SIZE','Preview dimensions must preserve the composition aspect ratio.');
    if(options.nativeGpu){
      if(typeof options.nativeGpu!=='object'||Object.keys(options.nativeGpu).some(k=>!['executable','window','slots','maxBytes','dynamic','export','readback','mediaExport','rayQuery','resourceLimits','logicLimits','previewQuality','packedF16','graphTemplates'].includes(k))||options.nativeGpu.logicLimits!==undefined&&(!options.nativeGpu.logicLimits||typeof options.nativeGpu.logicLimits!=='object'||Array.isArray(options.nativeGpu.logicLimits)||Object.keys(options.nativeGpu.logicLimits).some(k=>!['maxMessageBytes','maxMemoryBytes'].includes(k))||Object.values(options.nativeGpu.logicLimits).some(n=>!Number.isSafeInteger(n)||n!<1))||options.nativeGpu.resourceLimits!==undefined&&(!options.nativeGpu.resourceLimits||typeof options.nativeGpu.resourceLimits!=='object'||Array.isArray(options.nativeGpu.resourceLimits)||Object.hasOwn(options.nativeGpu.resourceLimits,'allowWasm'))||typeof options.nativeGpu.executable!=='string'||!options.nativeGpu.executable.trim()||options.nativeGpu.rayQuery!==undefined&&typeof options.nativeGpu.rayQuery!=='boolean'||options.nativeGpu.window!==undefined&&typeof options.nativeGpu.window!=='boolean'||options.nativeGpu.dynamic!==undefined&&!['interactive','throughput'].includes(options.nativeGpu.dynamic)||options.nativeGpu.readback!==undefined&&options.nativeGpu.readback!=='final-surface')throw new EngineError('E_NATIVE_OPTIONS','Native backend needs an explicit executable and bounded options');
      if(options.nativeGpu.packedF16!==undefined&&typeof options.nativeGpu.packedF16!=='boolean')throw new EngineError('E_NATIVE_OPTIONS','packedF16 must be boolean');
      if(options.nativeGpu.graphTemplates!==undefined&&typeof options.nativeGpu.graphTemplates!=='boolean')throw new EngineError('E_NATIVE_OPTIONS','graphTemplates must be boolean');
      if(options.nativeGpu.previewQuality!==undefined&&(options.nativeGpu.previewQuality!==true||!options.nativeGpu.window||
        options.nativeGpu.dynamic!=='interactive'||options.nativeGpu.export||options.nativeGpu.mediaExport||options.nativeGpu.readback))
        throw new EngineError('E_PREVIEW_QUALITY','Quality profiles require an interactive preview window');
      const nativeBuild={...build,manifest:structuredClone(build.manifest)};
      if(options.nativeGpu.dynamic||options.nativeGpu.export||options.nativeGpu.mediaExport||options.nativeGpu.readback||build.manifest.stages.some(s=>s.engine==='native-gpu'&&(s.entry||s.composition))){
        if(build.manifest.stages.some(s=>!['native-gpu','audio'].includes(s.engine)))throw new EngineError('E_NATIVE_MIGRATION','Unknown visual backend; no browser fallback exists');
        nativeHostPolicy(nativeBuild);let renderer:Renderer|undefined;
        try{
          renderer=new Renderer(nativeBuild,options,width,height);
          const bootstrap=nativeBootstrapProgram(width,height,options.nativeGpu.window===true,options.nativeGpu.maxBytes??1024**3,options.nativeGpu.rayQuery===true);
          if(renderer.previewSegments)bootstrap.previewReuse='declarative-regions-v1';
          renderer.nativeBufferExporter=await NativeBufferExporter.create();renderer.nativeBufferExporter.configure(bootstrap);
          if(replacement){
            await replacement.preparePreviewReload(bootstrap);
            renderer.nativeClient=replacement;
            renderer.previewReplacement=true;
          }else renderer.nativeClient=await NativeGpuClient.create(bootstrap,{executable:options.nativeGpu.executable,window:options.nativeGpu.window,timeoutMs:options.timeoutMs});
          const hardware=await renderer.nativeClient.stats();if(hardware.protocolVersion!==2||!hardware.capabilities?.hardwareVerified)throw new EngineError('E_NATIVE_BINARY_VERSION','Native pipeline requires the version 2 device handshake');
          renderer.nativeLogic=new NativeLogicHost(nativeBuild,width,height,options.timeoutMs,{version:1,backend:'native-wgpu',owner:bootstrap.session,hardwareVerified:true,capabilities:hardware.capabilities},options.allowWasm===true,bootstrap.maxBytes,options.nativeGpu?.resourceLimits,(segment,signal)=>renderer!.executeNativeStateSegment(segment,signal),options.nativeGpu?.logicLimits,options.nativeGpu.previewQuality,options.nativeGpu.graphTemplates,options.cache!==false);await renderer.nativeLogic.init();
          // No speculative renderAt(0). Stateful authored logic executes only
          // for the caller's requested frame; the device is already admitted.
          renderer.nativePlan={program:bootstrap,stages:new Map(),output:{stage:'@native-composite',port:'surface'}};return renderer;
        }catch(e){await renderer?.close();throw e;}
      }
      const nativePlan=compileNativePlan(nativeBuild.manifest,{width,height,...options.nativeGpu});if(options.nativeGpu.rayQuery){nativePlan.program.version=2;nativePlan.program.rayQuery=true;}
      const renderer=new Renderer(nativeBuild,options,width,height);
      renderer.nativePlan=nativePlan;
      try{if(nativePlan.program.version===2){renderer.nativeBufferExporter=await NativeBufferExporter.create();renderer.nativeBufferExporter.configure(nativePlan.program);}renderer.nativeClient=await NativeGpuClient.create(nativePlan.program,{executable:options.nativeGpu.executable,window:options.nativeGpu.window,timeoutMs:options.timeoutMs});}catch(error){await renderer.close();throw error;}
      return renderer;
    }
    if(stages.some(s=>s.engine==='native-gpu'))throw new EngineError('E_NATIVE_BACKEND_REQUIRED','Explicit nativeGpu backend selection is required');
    const renderer=new Renderer(build,options,width,height,audioOnly);
    try {
      renderer.fingerprint=hashValue([build.hash,'native-host',platform(),arch(),width,height,options.allowWasm===true,options.media??null]);
      await renderer.initializeStages(stages);
      return renderer;
    }catch(error){await renderer.close();throw error;}
  }
  private async initializeStages(stages:StageSpec[]){
    if(this.closed)throw new EngineError('E_RENDERER_CLOSED','Renderer has closed.');
    const {build,options}=this,c=build.manifest.composition,renderer=this;
    if(!this.fingerprint)this.fingerprint=hashValue([build.hash,'native-host',platform(),arch(),this.width,this.height,options.allowWasm===true,options.media??null]);
      const environment={build,options};
      for(const engine of new Set(stages.map(stage=>stage.engine))){
        if(renderer.adapters.has(engine))continue;
        const custom=customAdapters.get(engine);
        const adapter=custom?await custom(environment):engine==='audio'?new AudioAdapter(build,options.timeoutMs??20000,options.onProfile,options.audioResources):engine==='mock'?new MockAdapter('mock',c.width,c.height):undefined;
        if(!adapter)throw new EngineError('E_BACKEND_UNAVAILABLE',`Stage backend ${engine} is not implemented.`,{hint:'Use native-gpu with SpiderMonkey; HTML/CSS belongs in the Servo module.'});
        renderer.adapters.set(engine,adapter);
        if(adapter instanceof AudioAdapter){const stop=()=>{void adapter.dispose().catch(()=>{});};if(renderer.nativeAbort.signal.aborted)stop();else renderer.nativeAbort.signal.addEventListener("abort",stop,{once:true});}
      }
      await Promise.all(stages.filter(stage=>!renderer.initializedStages.has(stage.id)).map(async stage=>{
        renderer.initializedStages.add(stage.id);
        try{
          await measure(options.onProfile,'stage.init',()=>renderer.adapters.get(stage.engine)!.init(stage),{stageId:stage.id});
          options.onLog?.(`Initialized Stage ${stage.id} (${stage.engine})`);
        }catch(error){
          const failure=error instanceof EngineError?error:new EngineError('E_STAGE_INIT',`Stage ${stage.id} failed to initialize: ${(error as Error)?.message ?? String(error)}`,{stageId:stage.id});
          renderer.initializationErrors.set(stage.id,failure);
          options.onLog?.(`Stage ${stage.id} initialization failed (${failure.code})`);
        }
      }));
  }
  /** Existing DAG/time evaluator; only recording/submission is ordered. GPU work
   * remains in flight in separate bounded slots, default 2. No fake CPU outputs. */
  submitNativeFrame(frame:number,options:{signal?:AbortSignal;execution?:FrameExecution;previewRevision?:number;previewAdvance?:boolean;previewQuality?:PreviewQuality;previewCacheLookup?:boolean}={}):Promise<NativeFrameTicket>{
    const snapshot=this.capture(options.execution);
    const previewQuality=options.previewQuality&&previewQualityOptions(options.previewQuality,16.67).initial;
    const task=this.queue.then(()=>this.submitNativeOwned(frame,{...options,execution:snapshot,previewQuality}));this.queue=task.catch(()=>{});return task;
  }
  private async submitNativeOwned(frame:number,options:{signal?:AbortSignal;execution?:FrameExecution;previewRevision?:number;previewAdvance?:boolean;previewQuality?:PreviewQuality;previewCacheLookup?:boolean}={}):Promise<NativeFrameTicket>{
      options={...options,signal:options.signal?AbortSignal.any([options.signal,this.nativeAbort.signal]):this.nativeAbort.signal};
      assertSharedExecution(this.build.manifest.stages,options.execution);
      if(!this.nativeClient||!this.nativePlan)throw new EngineError('E_NATIVE_BACKEND_REQUIRED','Renderer has no native backend');
      if(this.closed)throw new EngineError('E_RENDERER_CLOSED','Renderer closed');
      if(!Number.isSafeInteger(frame)||frame<0||frame>=this.build.manifest.composition.durationInFrames)throw new EngineError('E_FRAME_RANGE','Native frame is outside the composition',{frame});
      if(options.signal?.aborted)throw new EngineError('E_RENDER_CANCELLED','Native frame cancelled before submission');
      if(options.previewQuality&&!this.options.nativeGpu?.previewQuality)throw new EngineError('E_PREVIEW_QUALITY','Frame quality requires a preview renderer');
      const previewCacheKey=this.previewSegments&&options.previewRevision!==undefined&&!options.previewAdvance&&!options.execution?
        this.previewSegments.signature(frame)+hashValue(['preview-display-v1',frame,this.width,this.height,this.options.nativeGpu?.packedF16===true,options.previewQuality??null]):undefined;
      if(previewCacheKey&&options.previewCacheLookup){
        try{return this.trackNativeTicket(await this.nativeClient.submit(frame,[],{signal:options.signal,previewRevision:options.previewRevision,previewCacheOnly:previewCacheKey}));}
        catch(error){if(!(error instanceof EngineError)||error.code!=='E_NATIVE_PREVIEW_CACHE_MISS')throw error;}
      }
      if(this.nativeLogic){
        if(this.nativeContinuationFailure)throw this.nativeContinuationFailure;
        let result:Awaited<ReturnType<NativeLogicHost['record']>>|undefined;
        try{
          result=await this.recordNativeRequested(frame,options.signal,options.execution,options.previewQuality);
          const frameBindings=await this.admitNativeResult(result),cacheable=nativePlanCacheable(result.program);
          if(this.previewCheckpointEligible){
            const p=result.program;
            if(p.stateContinuation||p.frameContinuation||p.modules?.length||p.inferences?.length||p.imports?.length||p.resourceLease||
              p.data?.some(d=>d.resident||d.sourceResource)||p.passes.some(pass=>pass.rayBuild||pass.rayQuery!==undefined))
              this.previewCheckpointEligible=false;
          }
          let stageCache:typeof result.stageCache|undefined;
          const {program}=result;
          if(cacheable&&result.stageCache.length){
            const wholeGraph=program.passes.every(pass=>pass.buffers?
              program.kernels[pass.kernel].kind==='compute':
              !pass.groups&&program.kernels[pass.kernel].replayImage==='whole-output-v1');
            const hasScratch=program.data?.some(d=>!d.immutable&&d.sourceImage===undefined);
            stageCache=result.stageCache.filter(entry=>entry.first===undefined?!hasScratch:wholeGraph);
          }
          const ticket=this.trackNativeTicket(await this.nativeClient.submit(frame,result.parameters,{
            signal:options.signal,frameBindings,previewRevision:options.previewRevision,previewAdvance:options.previewAdvance,
            previewTiming:!!options.previewQuality&&options.previewRevision!==undefined,
            previewCacheKey:cacheable?previewCacheKey:undefined,
            stageCache,
          }));
          this.nativeValues.set(ticket,structuredClone(result.valueOutputs));
          if(this.nativeContinuation){await ticket.completed;await this.finishNativeStateContinuation(true);}
          return ticket;
        }catch(error){
          if(this.nativeContinuation)return this.failNativeStateContinuation(error);
          throw error;
        }finally{
          if(result)await this.nativeLogic.releaseFrameResources(result.program);
        }
      }
      const target=nativePresentationTarget(this.build.manifest,frame);
      if(target.$ref!==this.nativePlan.output.stage||target.port!==this.nativePlan.output.port)throw new EngineError('E_NATIVE_ELIGIBILITY','Native output changed; rebuild the immutable plan');
      const recording={parameters:new Array<number[]>(this.nativePlan.program.passes.length),published:new Set<string>()};
      await this.execute(frame,undefined,undefined,undefined,recording);
      if(options.signal?.aborted)throw new EngineError('E_RENDER_CANCELLED','Native frame cancelled before submission');
      if(recording.parameters.some(p=>p===undefined)||recording.published.size!==this.nativePlan.stages.size)throw new EngineError('E_NATIVE_ELIGIBILITY','Inactive native Stage requires another immutable plan');
      return this.trackNativeTicket(await this.nativeClient.submit(frame,recording.parameters,{signal:options.signal,previewRevision:options.previewRevision,previewAdvance:options.previewAdvance}));
  }
  /** Explicit final-delivery materialization; never enabled by preview. */
  renderNativeSurface(frame:number,options:{signal?:AbortSignal;execution?:FrameExecution}={}):Promise<ProfessionalSurface>{
    const snapshot=this.capture(options.execution),task=this.queue.then(async()=>(await this.nativeFrameOwned(frame,{...options,execution:snapshot})).surface);this.queue=task.catch(()=>{});return task;
  }
  private async nativeFrameOwned(frame:number,options:{signal?:AbortSignal;execution?:FrameExecution}={}):Promise<ProfessionalFrame>{
    if(this.options.nativeGpu?.readback!=='final-surface'||!this.nativeBufferExporter)throw new EngineError('E_NATIVE_DATA_PERMISSION','Enable final-surface readback explicitly for accurate delivery');
    const ticket=await this.submitNativeOwned(frame,options);await ticket.completed;
    const result=await this.nativeBufferExporter.read(this.nativeClient!,ticket,'frameweave.final-surface',options),info=this.nativeOutputInfo!;
    const surface=surfaceFromPixels(info.width,info.height,result.values as Float32Array,{format:info.format as 'rgba16float'|'rgba32float',alpha:info.alpha as import('../media/surface.ts').AlphaMode,color:info.color as import('../media/surface.ts').ColorEncoding,deferBase64:true});
    return {surface,diagnostics:[],stageOutputs:structuredClone(this.nativeValues.get(ticket)??{}),cacheHits:0};
  }
  previewCheckpointBytes(){
    if(!this.previewCheckpointEligible||!this.nativeLogic?.previewCheckpointSupported()||!this.nativeClient)return;
    return 512+(this.nativeClient.program.data??[]).reduce((n,d)=>n+(d.persistent?d.length*4+128:0),0);
  }
  capturePreviewCheckpoint(budget:number):Promise<NativePreviewCheckpoint|undefined>{
    const task=this.queue.then(async()=>{
      const bytes=this.previewCheckpointBytes();
      if(bytes===undefined||bytes>=budget||!this.nativeClient||!this.nativeLogic)return;
      const logic=await this.nativeLogic.capturePreviewState(budget-bytes);
      if(!logic)return;
      const name='preview-'+(++this.previewCheckpointSequence);
      try{await this.nativeClient.stateCheckpoint('save-preview',name);}
      catch(error){
        if(error instanceof EngineError&&['E_NATIVE_STATE_BUDGET','E_NATIVE_STATE_SEQUENCE'].includes(error.code))return;
        throw error;
      }
      const checkpoint=Object.freeze({bytes:bytes+logic.bytes});
      this.previewCheckpoints.set(checkpoint,{name,logic:logic.states});
      return checkpoint;
    });
    this.queue=task.catch(()=>{});
    return task;
  }
  restorePreviewCheckpoint(checkpoint:NativePreviewCheckpoint){
    const task=this.queue.then(async()=>{
      const record=this.previewCheckpoints.get(checkpoint);
      if(!record||this.previewCheckpointBytes()===undefined||!this.nativeClient||!this.nativeLogic)
        throw new EngineError('E_NATIVE_PREVIEW_CHECKPOINT_UNSUPPORTED','Preview checkpoint belongs to a different or incompatible owner');
      await this.nativeClient.stateCheckpoint('restore',record.name);
      await this.nativeLogic.restorePreviewState(record.logic);
      if(this.preparedNative)await this.nativeLogic.releaseFrameResources(this.preparedNative.result.program);
      this.preparedNative=undefined;
      this.cache.clear();this.mediaCache.clear();this.previewCache.clear();
    });
    this.queue=task.catch(()=>{});
    return task;
  }
  releasePreviewCheckpoint(checkpoint:NativePreviewCheckpoint){
    const task=this.queue.then(async()=>{
      const record=this.previewCheckpoints.get(checkpoint);
      if(!record||!this.nativeClient)return;
      await this.nativeClient.stateCheckpoint('release',record.name);
      this.previewCheckpoints.delete(checkpoint);
    });
    this.queue=task.catch(()=>{});
    return task;
  }
  nativeStateCheckpoint(action:'save'|'restore'|'release',name:string){const task=this.queue.then(async()=>{if(!this.nativeClient)throw new EngineError('E_NATIVE_BACKEND_REQUIRED','GPU state requires a native owner');const result=await this.nativeClient.stateCheckpoint(action,name);if(action==='restore'){if(this.preparedNative)await this.nativeLogic?.releaseFrameResources(this.preparedNative.result.program);this.preparedNative=undefined;this.cache.clear();this.mediaCache.clear();this.previewCache.clear();}return result;});this.queue=task.catch(()=>{});return task;}
  private nativeLayoutKey(p:NativeProgram,frame=false){
    this.nativeBufferExporter?.configure(p);
    const kernels=p.kernels.map(k=>{let layouts=this.nativeKernelKeys.get(k.code);if(!layouts){layouts=new Map();this.nativeKernelKeys.set(k.code,layouts);}const layout=JSON.stringify([k.kind,k.inputCount,k.parameterWords,k.headerWords,k.targetFormat,k.meshMode,k.packedMask,k.replayImage]);let key=layouts.get(layout);if(key===undefined){key=++this.nextNativeKey;layouts.set(layout,key);}return key;});
    const data=p.data?.map(d=>{if(!d.immutable&&!d.persistent)return frame&&d.sourceImage===undefined?{type:d.type,immutable:d.immutable,sourceImage:d.sourceImage}:d;let key=this.nativeResourceKeys.get(d);if(key===undefined){key=++this.nextNativeKey;this.nativeResourceKeys.set(d,key);}return {immutable:d.immutable,persistent:d.persistent,key,length:d.length,type:d.type};});
    const passes=frame?p.passes.map(({header:_h,groups:_g,draw,...pass})=>({...pass,...draw?{draw:{...draw,count:0}}:{}})):p.passes;
    return JSON.stringify([p.images,data,kernels,passes,p.modules??[],frame?{...nativeExtensionLayout(p),imports:p.imports?.map(i=>i.source==='declared-video'?{...i,file:''}:i.source==='hardware-video'?{...i,video:{...i.video,frame:0,pts:0}}:i)}:nativeExtensionLayout(p)]);
  }
  private async recordNativeRequested(frame:number,signal?:AbortSignal,execution?:FrameExecution,quality?:PreviewQuality){
    assertSharedExecution(this.build.manifest.stages,execution);
    if(this.nativeContinuationFailure)throw this.nativeContinuationFailure;
    if(this.nativeContinuation&&(quality||this.preparedNative?.frame!==frame))await this.finishNativeStateContinuation(false);
    if(signal?.aborted)throw new EngineError('E_RENDER_CANCELLED','Native recording cancelled',{frame});
    const executionKey=hashValue(execution??null);
    if(!quality&&this.preparedNative?.frame===frame&&this.preparedNative.executionKey===executionKey){const result=this.preparedNative.result;this.preparedNative=undefined;return result;}
    if(this.preparedNative)await this.nativeLogic!.releaseFrameResources(this.preparedNative.result.program);this.preparedNative=undefined;
    return this.nativeLogic!.record(frame,signal,execution,quality);
  }
  prepareNativeFrame(frame:number,options:{signal?:AbortSignal;execution?:FrameExecution}={}):Promise<void>{
    const snapshot=this.capture(options.execution);
    const task=this.queue.then(async()=>{if(this.closed)throw new EngineError('E_RENDERER_CLOSED','Renderer closed');if(!this.nativeClient||!this.nativeLogic)throw new EngineError('E_NATIVE_BACKEND_REQUIRED','Native pipeline required');if(!Number.isSafeInteger(frame)||frame<0||frame>=this.build.manifest.composition.durationInFrames)throw new EngineError('E_FRAME_RANGE','Native preparation requires a composition frame');const result=await this.recordNativeRequested(frame,options.signal,snapshot);try{await this.admitNativeResult(result);if(options.signal?.aborted)throw new EngineError('E_RENDER_CANCELLED','Native preparation cancelled');this.preparedNative={frame,executionKey:hashValue(snapshot??null),result};}catch(e){await this.nativeLogic.releaseFrameResources(result.program);throw e;}});this.queue=task.catch(()=>{});return task;
  }
  private async admitNativeResult(result:Awaited<ReturnType<NativeLogicHost['record']>>,beforeReconfigure?:()=>Promise<void>):Promise<NativeFrameBindings|undefined>{
    const previous=this.nativePlan!.program,p=result.program;if(this.options.nativeGpu?.rayQuery===true)p.rayQuery=true;
    if(this.options.nativeGpu?.readback==='final-surface'&&!p.bufferOutputs?.some(o=>o.id==='frameweave.final-surface')){const info=p.images[result.output],data=p.data??=[];const index=data.push({type:'f32',length:info.width*info.height*4,initial:[],sourceImage:result.output})-1;(p.bufferOutputs??=[]).push({version:1,id:'frameweave.final-surface',buffer:index,info:fieldInfo({type:'f32',dimensions:[info.width,info.height,1],components:4,semantic:'generic',metadata:{source:'native-final-surface'}})});}
    if(this.options.nativeGpu?.packedF16&&packNativeF16Intermediates(p,result.output)){
      if(result.stageCache?.length)result.stageCache=result.stageCache.map(entry=>p.images[p.passes[entry.pass].output].storage?
        {...entry,key:hashValue(['packed-f16-v1',entry.key])}:entry);
    }
    const frameKey=JSON.stringify([result.output,this.nativeLayoutKey(p,true)]);
    const eligible=!p.frameContinuation&&!p.data?.some(d=>d.persistent)&&!p.bufferOutputs?.length;
    if(frameKey===this.nativeFrameLayout&&eligible&&!this.nativeFrameDeltas&&this.nativeLayoutKey(p)===this.nativeLayout)return;
    p.session=previous.session;p.maxBytes=previous.maxBytes;if(previous.previewReuse)p.previewReuse=previous.previewReuse;
    this.nativeOutputInfo=structuredClone(p.images[result.output]);
    if(this.options.nativeGpu?.mediaExport){const info=p.images[result.output];if(!samePixelColor(info.color as import('../media/surface.ts').ColorEncoding,this.options.nativeGpu.mediaExport.workingColor))throw new EngineError('E_NATIVE_MEDIA_COLOR','Native composition working colour differs from the explicit GPU output profile');p.mediaExport={...this.options.nativeGpu.mediaExport,image:result.output,alpha:info.alpha==='premultiplied'?1:info.alpha==='straight'?2:0};}
    const output=this.options.nativeGpu?.export;
    if(this.options.nativeGpu?.window||output&&output.format!=='gbrapf32le')configureNativeDisplay(p,result.output,output?'delivery':'preview');if(output)p.export={...output,image:result.output,display:p.display!==null};
    const capacity=nativeFrameCapacity(p,p.maxBytes,this.options.nativeGpu?.slots??(this.options.nativeGpu?.dynamic==='interactive'?3:128));p.slots=capacity.capacity;p.imageAllocations=capacity.layout.mapping;
    if(eligible&&frameKey===this.nativeFrameLayout&&p.slots===previous.slots){
      this.nativeFrameDeltas=true;
      return {version:1,imports:p.imports?.filter(i=>i.source==='declared-video'||i.source==='hardware-video'),data:(p.data??[]).flatMap((d,index)=>!d.immutable&&!d.persistent&&d.sourceImage===undefined?[{index,length:d.length,initial:d.initial}]:[]),passes:p.passes.map(pass=>({header:pass.header,...pass.groups?{groups:pass.groups}:{},...pass.draw?{count:pass.draw.count}:{}}))};
    }
    const key=this.nativeLayoutKey(p);if(key===this.nativeLayout&&!this.nativeFrameDeltas)return;
    const cacheable=this.options.nativeGpu?.graphTemplates!==false&&nativePlanCacheable(p);
    const planKey=cacheable?JSON.stringify([result.output,p.slots,p.imageAllocations,key]):undefined;
    await beforeReconfigure?.();
    const client=this.nativeClient!;
    let id=planKey===undefined?undefined:this.nativePlanCache.get(planKey);
    if(id===undefined||!await client.activatePlan(id)){
      id=cacheable?++this.nativePlanSequence:undefined;
      await client.reconfigure(p,id);
    }
    if(planKey!==undefined){
      this.nativePlanCache.delete(planKey);
      this.nativePlanCache.set(planKey,id!);
      if(this.nativePlanCache.size>8)this.nativePlanCache.delete(this.nativePlanCache.keys().next().value!);
    }else this.nativePlanCache.clear();
    await this.nativeLogic?.retainFrameResources(p);
    this.nativePlan!.program=p;this.nativeLayout=key;this.nativeFrameLayout=frameKey;this.nativeFrameDeltas=false;
  }
  submitNativeBatch(frames:readonly number[],options:{signal?:AbortSignal}={}):Promise<NativeFrameTicket[]>{
    const task=this.queue.then(async()=>{
      assertSharedExecution(this.build.manifest.stages);
      if(!this.nativeClient||!this.nativeLogic)throw new EngineError('E_NATIVE_BACKEND_REQUIRED','Batch submission requires the native pipeline');if(this.closed)throw new EngineError('E_RENDERER_CLOSED','Renderer closed');
      if(!frames.length||frames.some(f=>!Number.isSafeInteger(f)||f<0||f>=this.build.manifest.composition.durationInFrames))throw new EngineError('E_FRAME_RANGE','Invalid bounded native batch');
      let batch:{frame:number;parameters:number[][];frameBindings?:NativeFrameBindings;resources:NativeProgram}[]=[];const tickets:NativeFrameTicket[]=[];
      const flush=async()=>{if(batch.length){const current=batch;batch=[];try{const submitted=(await this.nativeClient!.submitBatch(current,options)).map(t=>this.trackNativeTicket(t));for(const ticket of submitted)tickets.push(ticket);if(this.nativeContinuation){await Promise.all(submitted.map(t=>t.completed));await this.finishNativeStateContinuation(true);}}finally{await Promise.all(current.map(f=>this.nativeLogic!.releaseFrameResources(f.resources)));}}};
      try{for(const frame of frames){if(options.signal?.aborted)throw new EngineError('E_RENDER_CANCELLED','Native recording cancelled');const result=await this.recordNativeRequested(frame,options.signal);try{const frameBindings=await this.admitNativeResult(result,flush);batch.push({frame,resources:result.program,parameters:result.parameters,...frameBindings?{frameBindings}:{}});}catch(e){await this.nativeLogic.releaseFrameResources(result.program);throw e;}if(batch.length>=this.nativePlan!.program.slots)await flush();}
      await flush();return tickets;}catch(error){if(this.nativeContinuation)return this.failNativeStateContinuation(error);throw error;}finally{await Promise.all(batch.map(f=>this.nativeLogic!.releaseFrameResources(f.resources)));}
    });this.queue=task.catch(()=>{});return task;
  }
  async nativeStats(){if(!this.nativeClient)throw new EngineError('E_NATIVE_BACKEND_REQUIRED','Renderer has no native backend');return {...await this.nativeClient.stats(),...this.nativeLogic?{graphTemplates:this.nativeLogic.graphStats()}:{},stateContinuations:{version:1,segments:this.stateSegmentCount,frames:this.stateSegmentFrames,rollbacks:this.stateSegmentRollbacks,pending:!!this.nativeContinuation,failed:!!this.nativeContinuationFailure},...this.nativeOutputInfo?{sourceOutput:structuredClone(this.nativeOutputInfo)}:{}};}
  private trackNativeTicket(ticket:NativeFrameTicket){this.nativePending.add(ticket.completed);void ticket.completed.finally(()=>this.nativePending.delete(ticket.completed)).catch(()=>{});return ticket;}
  /** Explicit host-only CPU readback. Serializes with submissions; publishing alone never reads back. */
  exportNativeBuffer(ticket:NativeFrameTicket,id:string,options:{signal?:AbortSignal}={}):Promise<NativeBufferValue>{
    const task=this.queue.then(async()=>{
      if(this.closed)throw new EngineError('E_RENDERER_CLOSED','Renderer closed');
      if(!this.nativeClient||!this.nativeBufferExporter)throw new EngineError('E_NATIVE_BACKEND_REQUIRED','Native buffer export requires a native owner');
      if(options.signal?.aborted)throw new EngineError('E_RENDER_CANCELLED','Native buffer export cancelled');
      await Promise.all([...this.nativePending]);
      return this.nativeBufferExporter.read(this.nativeClient,ticket,id,options);
    });this.queue=task.catch(()=>{});return task;
  }
  async prepareNativePreviewReload(build:BuiltProject,options:RendererOptions){
    if(!this.nativeClient||!this.options.nativeGpu?.window||!options.nativeGpu?.window||options.nativeGpu.dynamic!=='interactive')
      throw new EngineError('E_NATIVE_PREVIEW_RELOAD','Preview replacement requires an interactive window');
    await this.queue;
    await Promise.all([...this.nativePending]);
    return Renderer.createForExecution(build,options,false,this.nativeClient);
  }
  async commitNativePreviewReload(previous:Renderer,state:{frame:number;revision:number;input:number;duration:number}){
    if(!this.previewReplacement||!this.nativeClient||this.nativeClient!==previous.nativeClient)
      throw new EngineError('E_NATIVE_PREVIEW_RELOAD','Preview replacement does not own this window');
    const retainPreview=this.previewSegments&&previous.previewSegments?this.previewSegments.retainFrom(previous.previewSegments):undefined;
    await this.nativeClient.commitPreviewReload({...state,retainPreview});
    this.previewReplacement=false;
    previous.nativeClient=undefined;
  }
  nativePreviewAudioPort(){
    if(!this.nativeClient)throw new EngineError('E_NATIVE_DISPLAY','Native preview audio requires a window');
    return this.nativeClient.previewAudioPort();
  }
  nativePreviewEvents(events:NativePreviewEvents){
    if(!this.nativeClient||!this.options.nativeGpu?.window)throw new EngineError('E_NATIVE_DISPLAY','Native preview events require a window');
    this.nativeClient.setPreviewEvents(events);
  }
  updateNativePreviewState(state:{revision:number;input:number;duration:number;label:string;active:boolean}){
    if(!this.nativeClient||!this.options.nativeGpu?.window)throw new EngineError('E_NATIVE_DISPLAY','Native preview control requires a window');
    return this.nativeClient.updatePreviewState(state);
  }
  nativeExited(){if(!this.nativeClient)throw new EngineError('E_NATIVE_BACKEND_REQUIRED','Renderer has no native backend');return this.nativeClient.exited;}
  renderFrame(frame:number,stageId?:string,execution?:FrameExecution):Promise<RenderedFrame>{
    const snapshot=this.capture(execution);
    const task=this.queue.then(async()=>{const result=await measure(this.options.onProfile,'renderer.frame',()=>this.render(frame,stageId,false,snapshot),{frame,stageId});return {png:result.image,diagnostics:result.diagnostics,stageOutputs:result.stageOutputs,cacheHits:result.cacheHits};});this.queue=task.catch(()=>{});return task;
  }
  renderPreviewFrame(frame:number,execution?:FrameExecution):Promise<PreviewFrame>{
    const snapshot=this.capture(execution);
    const task=this.queue.then(()=>this.render(frame,undefined,!!this.options.preview,snapshot));this.queue=task.catch(()=>{});return task;
  }
  /** Evaluate declared ports only. Data-only Stages never need a fabricated image output. */
  evaluateFrame(frame:number,stageId?:string,execution?:FrameExecution){
    const snapshot=this.capture(execution);
    const task=this.queue.then(async()=>{if(this.nativeClient){if(stageId!==undefined)throw new EngineError('E_NATIVE_MATERIALIZATION','Native JSON evaluation uses the complete composition');const ticket=await this.submitNativeOwned(frame,{execution:snapshot});await ticket.completed;return {stageOutputs:structuredClone(this.nativeValues.get(ticket)??{}),diagnostics:[],cacheHits:0};}const {outputs,diagnostics,cacheHits}=await this.execute(frame,stageId,snapshot);return {stageOutputs:outputs,diagnostics,cacheHits};});this.queue=task.catch(()=>{});return task;
  }
  async renderAt(position:RenderPosition,stageId?:string,execution?:FrameExecution):Promise<RenderedFrame>{
    if(!position || typeof position!=='object' || Array.isArray(position))
      throw new EngineError('E_TIME_POSITION','Specify exactly one of {frame: number} or {time: seconds}.');
    const keys=Object.keys(position);
    if(keys.length!==1 || keys[0]!=='frame' && keys[0]!=='time')
      throw new EngineError('E_TIME_POSITION','Specify exactly one of {frame: number} or {time: seconds}.');
    const value=keys[0]==='frame'?position.frame:position.time;
    if(typeof value!=='number' || !Number.isFinite(value) || value<0)
      throw new EngineError('E_TIME_POSITION','Frame/time position must be finite and nonnegative.');
    const fps=this.build.manifest.composition.fps;
    return this.renderFrame(keys[0]==='frame'?value:Math.round(value*fps.num/fps.den),stageId,execution);
  }
  /** Host primitive. Same instances/validation as the DAG, no dependency traversal or result memoization. */
  runStage(stageId:string,frame:number,inputs:Record<string,PortValue>,execution?:FrameExecution):Promise<StageFrameResult>{
    if(this.nativeClient)return Promise.reject(new EngineError('E_NATIVE_MATERIALIZATION','Native leases are not CPU PortValues; use submitNativeFrame'));
    const stage=this.build.manifest.stages.find(s=>s.id===stageId);
    if(!stage)return Promise.reject(new EngineError('E_STAGE_REFERENCE','Unknown Stage',{stageId,frame}));
    if(!Number.isSafeInteger(frame)||frame<0||frame>=this.build.manifest.composition.durationInFrames)return Promise.reject(new EngineError('E_FRAME_RANGE','Call frame outside composition',{stageId,frame}));
    const snapshot=this.capture(execution),copied=cloneMediaValue(inputs);
    const task=this.queue.then(async()=>{
      if(this.closed)throw new EngineError('E_RENDERER_CLOSED','Renderer has closed');
      if(stage.engine==='audio'||Object.values(stage.outputs).includes('audio'))throw new EngineError('E_STAGE_CALL_INTERVAL','SO-1 frame calls do not execute Audio Stages; use evaluateInterval',{stageId,frame});
      assertSharedExecution([stage],snapshot);
      const context=frameContext(this.build.manifest,stage,frame);
      if(!isActive(stage,frame))throw new EngineError('E_STAGE_INACTIVE','Stage inactive',{stageId,frame});
      const initializationError=this.initializationErrors.get(stageId);if(initializationError)throw initializationError;
      const props=frameStageProps(evaluate(stage.props,context) as Record<string,unknown>,stageId,snapshot),inputTypes={...stage.inputTypes};
      if(Object.hasOwn(props,CONFIG)){
        const d=definition(props[CONFIG]),r=runtime(props[RUNTIME],context);
        if(r.callStage!==stageId)throw new EngineError('E_SHARED_CALL_SCOPE','Expected host call snapshot',{stageId,frame});
        for(const b of d.reads){if(Object.hasOwn(copied,b.input))throw new EngineError('E_SHARED_ACCESS','Managed input cannot be supplied',{stageId,frame});delete inputTypes[b.input];}
      }
      assertStageInputs({...stage,inputs:copied as any,inputTypes},copied,{frame});
      try{return await this.invokeStage(stage,context,copied,props);}
      finally{this.callEpochs.set(stageId,(this.callEpochs.get(stageId)??0)+1);}
    });this.queue=task.catch(()=>{});return task;
  }
  private async invokeStage(stage:StageSpec,context:FrameContext,inputs:Record<string,PortValue>,props:Record<string,unknown>,audioRequest?:IntervalRequest):Promise<StageFrameResult>{
    const adapter=this.adapters.get(stage.engine)!;
    const result=audioRequest?await renderStageInterval(adapter,stage,audioRequest,inputs,props):await adapter.renderAt(stage,context,inputs,props);
    await measure(this.options.onProfile,'stage.validate',()=>validateResult(stage,result),{stageId:stage.id,frame:context.globalFrame});return result;
  }
  private capture(execution?:FrameExecution){return captureFrameExecution(execution,this.build.manifest.stages.map(s=>s.id));}
  evaluateInterval(interval:SampleInterval,stageId?:string){
    const snapshot=structuredClone(interval);assertInterval(snapshot);
    const task=this.queue.then(async()=>{const result=await this.execute(intervalFrame(this.build.manifest,snapshot),stageId,undefined,snapshot);return {stageOutputs:result.outputs,diagnostics:result.diagnostics,cacheHits:result.cacheHits};});this.queue=task.catch(()=>{});return task;
  }
  private async execute(frame:number,stageId?:string,execution?:FrameExecution,interval?:SampleInterval,native?:{parameters:number[][];published:Set<string>}){
    if(this.nativeClient&&!native&&!interval)throw new EngineError('E_NATIVE_MATERIALIZATION','Native resident output requires submitNativeFrame; CPU/file materialization is not implemented in this checkpoint');
    if(this.closed)throw new EngineError('E_RENDERER_CLOSED','Renderer has closed.');
    const tvg=this.build.manifest,c=tvg.composition;
    if(this.audioOnly&&!interval)throw new EngineError('E_AUDIO_INTERVAL_ONLY','This Renderer was initialized for sample intervals');
    const stages=interval?audioExecutionStages(tvg,stageId):tvg.stages;
    // Selecting execution work never removes the original project-wide Shared
    // host/transaction preflight. Audio intervals do not publish Shared frames.
    assertSharedExecution(tvg.stages,execution);
    if(interval)await this.initializeStages(stages);
    if(!Number.isInteger(frame) || frame<0 || frame>=c.durationInFrames)throw new EngineError('E_FRAME_RANGE',`Frame ${frame} is outside [0, ${c.durationInFrames-1}].`,{frame});
    let needed:Set<string>|undefined;
    if(stageId){
      if(!tvg.stages.some(stage=>stage.id===stageId))throw new EngineError('E_STAGE_REFERENCE',`Unknown Stage ${stageId}.`,{stageId});
      needed=new Set();
      const visit=(id:string)=>{if(needed!.has(id))return;needed!.add(id);const stage=tvg.stages.find(stage=>stage.id===id)!;Object.values(stage.inputs).filter(ref).forEach(input=>visit(input.$ref));};visit(stageId);
    }
    const outputs:Record<string,Record<string,PortValue>>={},diagnostics:Diagnostic[]=[];
    let cacheHits=0;
    for(const level of topologicalLevels(stages)){
      const results=await Promise.allSettled(level.filter(stage=>(!needed || needed.has(stage.id)) && isActive(stage,frame)).map(async stage=>{
        if(native){
          const plan=this.nativePlan!.stages.get(stage.id)!;
          for(const value of Object.values(stage.inputs))if(ref(value)&&!native.published.has(value.$ref))throw new EngineError('E_INACTIVE_INPUT','Native producer unavailable',{stageId:stage.id,frame});
          const context=frameContext(tvg,stage,frame),props=evaluate(stage.props,context) as Record<string,unknown>;
          native.parameters[plan.pass]=nativeParameters(stage,props,plan.description);native.published.add(stage.id);return;
        }
        const audioRequest=stageAudioRequest(tvg,stage,frame,interval);if(audioRequest===null)return;
        if(interval&&Object.values(stage.outputs).includes('audio')&&audioRequest===undefined)throw new EngineError('E_AUDIO_CAPABILITY','Frame-only adapter cannot satisfy audio interval',{stageId:stage.id});
        const initializationError=this.initializationErrors.get(stage.id);
        if(initializationError)throw initializationError;
        const resolvedInputs:Record<string,unknown>={};
        for(const [name,value]of Object.entries(stage.inputs)){
          if(ref(value)){
            const output=outputs[value.$ref]?.[value.port];
            if(output===undefined)throw new EngineError('E_INACTIVE_INPUT',`Stage ${stage.id} input ${name} refers to unavailable ${value.$ref}.${value.port} at frame ${frame}.`,{stageId:stage.id,frame});
            resolvedInputs[name]=output;
          }else resolvedInputs[name]=value;
        }
        assertStageInputs(stage,resolvedInputs,{frame});
        const inputs=await measure(this.options.onProfile,'stage.input-copy',async()=>cloneMediaValue(resolvedInputs) as Record<string,PortValue>,{stageId:stage.id,frame});
        const context=frameContext(tvg,stage,frame),props=frameStageProps(evaluate(stage.props,context) as Record<string,unknown>,stage.id,execution);
        // Declarative pixels depend on evaluated nodes, not the frame number itself.
        // Unknown native code and nodes with explicit visibility windows keep full context keys.
        const hasWindow=(nodes:unknown):boolean=>!!nodes&&typeof nodes==='object'&&(Object.hasOwn(nodes,'start')||Object.hasOwn(nodes,'end')||Object.values(nodes).some(hasWindow));
        const visualKey=context;
        const key=await measure(this.options.onProfile,'stage.key',async()=>hashValue([this.fingerprint,stage.id,this.callEpochs.get(stage.id)??0,stage.inputTypes ?? {},audioRequest?{visualKey,audioRequest}:visualKey,inputs,props]),{stageId:stage.id,frame});
        let result=this.options.cache===false?undefined:this.cache.get(key);
        if(result){cacheHits++;result.diagnostics=result.diagnostics.map(d=>({...d,frame}));}
        else {
          result=await this.invokeStage(stage,context,inputs,props,audioRequest);
          if(this.options.cache!==false)this.cache.set(key,result);
        }
        outputs[stage.id]=result.outputs;diagnostics.push(...result.diagnostics);
      }));
      const failures=results.filter((result):result is PromiseRejectedResult=>result.status==='rejected');
      if(failures.length){const first=diagnostic(failures[0].reason);throw new EngineError(first.code,first.message,{stageId:first.stageId,frame,hint:first.hint,details:failures.map(failure=>diagnostic(failure.reason))});}
    }
    return {outputs,diagnostics,cacheHits};
  }
  private async render(frame:number,stageId?:string,displayPreview=false,execution?:FrameExecution):Promise<PreviewFrame>{
    if(this.nativeClient){
      if(stageId!==undefined)throw new EngineError('E_NATIVE_MATERIALIZATION','Native image materialization uses the complete composition');
      const result=await this.nativeFrameOwned(frame,{execution}),policy=this.options.media??{workingColor:linear709,legacySdr:'srgb' as const,preview:{color:srgb,clip:true}};
      const image=await mediaPreview(result.surface,policy,d=>result.diagnostics.push(d),this.ocioWorker);return {image,mime:'image/png',diagnostics:result.diagnostics,stageOutputs:result.stageOutputs,cacheHits:result.cacheHits};
    }
    const {outputs,diagnostics,cacheHits}=await this.execute(frame,stageId,execution),tvg=this.build.manifest,c=tvg.composition;
    if(!this.build.manifest.stages.some(s=>Object.values(s.outputs).includes('surface')))throw new EngineError('E_AUDIO_NO_VISUAL','Audio-only Renderer has no image output; use sample intervals/WAV');
    let png:Buffer;
    const hasFloat=stageId?Object.values(outputs[stageId]??{}).some(isProfessionalSurface):tvg.layers.some(l=>l.source&&isProfessionalSurface(outputs[l.source.$ref]?.[l.source.port]));
    if(this.options.media||hasFloat){
      const result=await this.mediaFromOutputs(frame,outputs,diagnostics,cacheHits,stageId);
      const key=hashValue([result.surface,this.options.media!.preview]),cached=this.options.cache===false?undefined:this.previewCache.get(key);
      if(cached){png=cached.png;diagnostics.push(...cached.diagnostics);}else{const added:Diagnostic[]=[];png=await measure(this.options.onProfile,'media.preview-ocio-and-png',()=>mediaPreview(result.surface,this.options.media!,d=>{diagnostics.push(d);added.push(d);},this.ocioWorker),{frame});if(this.options.cache!==false)this.previewCache.set(key,{png,diagnostics:added});}
    }else if(stageId){
      const values=outputs[stageId];
      if(!values)throw new EngineError('E_STAGE_INACTIVE',`Stage ${stageId} is inactive at frame ${frame}.`,{stageId,frame});
      const image=Object.values(values).find(surface);
      if(!image)throw new EngineError('E_STAGE_NO_SURFACE',`Stage ${stageId} has no PNG surface output.`,{stageId,frame,details:values});
      png=Buffer.from(image.dataUrl.split(',')[1],'base64');
    }else{
      const policy={workingColor:linear709,legacySdr:'srgb' as const,preview:{color:srgb,clip:true}};
      const sizes=Object.fromEntries(tvg.stages.flatMap(s=>Object.keys(outputs[s.id]??{}).map(p=>[s.id+':'+p,{width:s.width??c.width,height:s.height??c.height}])));
      const composed=await composeMediaFrame({width:this.width,height:this.height,compositionWidth:c.width,compositionHeight:c.height,background:c.background,layers:layersForMedia({...tvg,layers:evaluate(tvg.layers,compositionContext(tvg,frame))},'surface'),outputs,sizes,frame,policy,diagnostics});
      png=await mediaPreview(composed,policy,d=>diagnostics.push(d),this.ocioWorker);
    }
    const result:PreviewFrame={image:png,mime:png[0]===0xff&&png[1]===0xd8?'image/jpeg':'image/png',diagnostics,stageOutputs:outputs,cacheHits};
    if(this.options.preview)return result;
    const small=await sharp(png).resize(32,18,{fit:'fill'}).ensureAlpha().raw().toBuffer();
    let max=0,alpha=0;
    for(let i=0;i<small.length;i+=4){max=Math.max(max,small[i],small[i+1],small[i+2]);alpha+=small[i+3];}
    if(alpha===0)diagnostics.push({code:'W_BLANK_FRAME',severity:'warning',message:'The rendered frame is fully transparent.',frame,stageId});
    else if(max<5)diagnostics.push({code:'W_BLACK_FRAME',severity:'warning',message:'The rendered frame is nearly black. This may be intentional; inspect the actual image.',frame,stageId});
    return result;
  }
  /** Same queue and DAG as SDR. No PNG is created on this path. */
  renderMediaFrame(frame:number,stageId?:string,execution?:FrameExecution):Promise<ProfessionalFrame>{
    const snapshot=this.capture(execution);
    const task=this.queue.then(async()=>{if(!this.options.media)throw new EngineError('E_MEDIA_POLICY','An explicit scene-linear media working policy is required');if(this.nativeClient){if(stageId!==undefined)throw new EngineError('E_NATIVE_MATERIALIZATION','Native media materialization uses the complete composition');const result=await this.nativeFrameOwned(frame,{execution:snapshot});if(!samePixelColor(result.surface.color,this.options.media.workingColor))throw new EngineError('E_NATIVE_COLOR_POLICY','Native composition and requested working colour differ; convert explicitly in the Stage');return result;}const result=await this.execute(frame,stageId,snapshot);return this.mediaFromOutputs(frame,result.outputs,result.diagnostics,result.cacheHits,stageId);});this.queue=task.catch(()=>{});return task;
  }
  private async mediaFromOutputs(frame:number,outputs:Record<string,Record<string,PortValue>>,diagnostics:Diagnostic[],cacheHits:number,stageId?:string):Promise<ProfessionalFrame>{
    const policy=this.options.media;if(!policy)throw new EngineError('E_MEDIA_POLICY','An explicit scene-linear media working policy is required');
    if(stageId){const value=Object.values(outputs[stageId]??{}).find(v=>isProfessionalSurface(v)||surface(v));if(!value)throw new EngineError('E_STAGE_NO_SURFACE','Selected Stage has no available surface',{stageId});return {surface:isProfessionalSurface(value)?value:await expandLegacySurface(value as Surface,policy),diagnostics,stageOutputs:outputs,cacheHits};}
    const tvg=this.build.manifest,c=tvg.composition,sizes:Record<string,{width:number;height:number}>={};
    for(const stage of tvg.stages)for(const port of Object.keys(outputs[stage.id]??{}))sizes[stage.id+':'+port]={width:stage.width??c.width,height:stage.height??c.height};
    const layers=layersForMedia({...tvg,layers:evaluate(tvg.layers,compositionContext(tvg,frame))},'surface');
    const active=layers.filter(l=>frame>=l.start&&frame<l.end),sources=Object.fromEntries(active.flatMap(l=>[l.source,l.mask].filter(Boolean).map(r=>[r!.$ref+':'+r!.port,outputs[r!.$ref]?.[r!.port]])));
    const key=hashValue([this.fingerprint,active,sizes,c.background,sources]),cached=this.options.cache===false?undefined:this.mediaCache.get(key);
    if(cached){diagnostics.push(...cached.diagnostics);return {surface:cached.surface,diagnostics,stageOutputs:outputs,cacheHits,compositeCacheHit:true};}
    const before=diagnostics.length;
    const result=await measure(this.options.onProfile,'media.float-composite',()=>composeMediaFrame({width:this.width,height:this.height,compositionWidth:c.width,compositionHeight:c.height,background:c.background,layers,outputs,sizes,frame,policy,diagnostics,timing:(phase,durationMs)=>{try{this.options.onProfile?.({phase:'media.'+phase,durationMs,outcome:'ok',frame});}catch{}}}),{frame});
    if(this.options.cache!==false)this.mediaCache.set(key,{surface:result,diagnostics:diagnostics.slice(before)});
    return {surface:result,diagnostics,stageOutputs:outputs,cacheHits,compositeCacheHit:false};
  }
  /** Native host health; no browser runtime is loaded. */
  status(){return {connected:!this.closed&&(!this.nativeClient||this.nativeClient.connected()),...this.nativeClient?{nativeBackend:'wgpu',nativeFrameSlots:this.nativePlan!.program.slots}:{},initializationFailed:this.initializationErrors.size>0};}
  close():Promise<void>{
    if(this.closing)return this.closing;
    if(this.closed)return Promise.resolve();
    this.closed=true;this.nativeAbort.abort();this.cache.clear();this.mediaCache.clear();this.previewCache.clear();
    this.nativeKernelKeys.clear();this.nativePlanCache.clear();this.preparedNative=undefined;
    const logicClosing=this.nativeLogic?.closeStages();void logicClosing?.catch(()=>{});
    this.closing=measure(this.options.onProfile,'renderer.close',async()=>{
    if(this.nativeClient||this.nativeBufferExporter)await this.queue.catch(()=>{});
    this.previewCheckpoints=new WeakMap();
    await this.finishNativeStateContinuation(false).catch(()=>{});const nativeDisposal=await Promise.allSettled([logicClosing]);
    // Stage disposers run with their GPU owner available. The child close event
    // then confirms ORT/model handles are gone before deleting host lease files.
    nativeDisposal.push(...await Promise.allSettled([this.previewReplacement?this.nativeClient?.abortPreviewReload():this.nativeClient?.close()]));
    nativeDisposal.push(...await Promise.allSettled([this.nativeLogic?.closeResources()]));
    nativeDisposal.push(...await Promise.allSettled([this.nativeBufferExporter?.close()]));
    const disposal=await Promise.allSettled([...this.adapters.values()].map(adapter=>adapter.dispose()).concat(this.ocioWorker.close()));
    const failed=[...nativeDisposal,...disposal].find((r):r is PromiseRejectedResult=>r.status==='rejected');if(failed)throw failed.reason;
    });
    const cleanup=this.closing;
    // Preserve settled idempotence (including a previously reported disposal error),
    // while concurrent callers still await the actual in-flight cleanup.
    void cleanup.then(()=>{this.closing=undefined;},()=>{this.closing=undefined;});
    return cleanup;
  }
}

export { MockAdapter } from './mock-adapter.ts';
