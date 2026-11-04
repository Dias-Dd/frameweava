import {assertSharedExecution} from '../shared-state/execution-host.ts';
import {frameStageProps,captureFrameExecution,type FrameExecution} from '../../src/render/frame-execution.ts';
import {assertNativePorts,childFrameContext} from '../stage-orchestration/native-ports.ts';
import {stageDefinitions,stageScopeKey,isStageInput,type NativePortPacket} from '../stage-orchestration/composite-types.ts';
import {restoreNativeDataSeeds} from './data-seeds.ts';
import {assertNativeMetadata,assertNativeMetadataBytes} from './capacity.ts';
import type {ExecuteNativeStateSegment} from './state-segments.ts';
import {appendTemporalProgram} from './temporal-program.ts';
import {temporalFrameContext,temporalGlobalFrame} from './temporal-clock.ts';
import type {TemporalInputRequest} from './temporal-exchange.ts';
import {CONFIG} from '../../src/shared-state/protocol.ts';
import {nativePixelInfo as pixelInfo} from './image-info.ts';
import {sealedStageModuleResources} from '../spidermonkey-host/sealed-module-resources.ts';
import {resolve} from 'node:path';
import {spiderMonkeyTransport,type TransportOptions} from '../spidermonkey-host/transport.ts';
import {nativeHostPolicy} from '../spidermonkey-host/policy.ts';
import type {BuiltProject,FrameContext,PortValue,StageSpec} from '../../src/core/types.ts';
import type {PreviewQuality} from './preview-quality.ts';
import {NativeGraphDecoder,type NativeGraphPacket} from './graph-template.ts';
import {EngineError} from '../../src/core/errors.ts';
import {topologicalLevels,isPortRef} from '../../src/core/graph.ts';
import {frameContext,isActive,compositionContext,hashString} from '../../src/core/time.ts';
import {evaluate} from '../../src/core/animation.ts';
import {randomBytes} from 'node:crypto';
import type {NativeProgram,NativeStageCacheRef} from './client.ts';
import {hashValue} from '../../src/render/cache.ts';
import type {NativeRecordingScope} from './scope.ts';
import {appendNativeComposite} from './composite.ts';
import {nativePixelShader} from '../gpu-effects/pixel-shader.ts';
import {nativeParameters,type NativePixelDescription} from './program.ts';
import type {NativeScopeEvidence} from './provenance.ts';
import {engineVersion} from '../../src/compiler/runtime-lock.ts';
import type {ColorEncoding} from '../../src/media/surface.ts';
import type {NativeResourceOptions} from './resource-images.ts';
import {NativeResourceImages} from './resource-images.ts';

export type NativePreviewLogicState=ReadonlyMap<string,Uint8Array>;
type Packet=ReturnType<NativeRecordingScope['packet']>;
/** Adapter for authored JS/React logic, not a second renderer. All topology,
 * time contexts and Layers come from the existing TVG. DOM pixels never
 * enter this protocol. SpiderMonkey OS isolation and sealed resource admission are retained. */
export class NativeLogicHost {
 private stageInferences=new Map<string,NonNullable<Packet['inferences']>>();private inferencePool:NonNullable<NativeProgram['inferences']>=[];private inferenceIndices=new Map<string,number[]>();
 private stageModules=new Map<string,NonNullable<NativeProgram['modules']>>();
 private modulePool:NonNullable<NativeProgram['modules']>=[];private moduleIndices=new Map<string,number[]>();
 private stateDefinitions=new WeakMap<object,NonNullable<NativeProgram['data']>[number]>();
 private statePool=new Map<string,NonNullable<NativeProgram['data']>[number]>();
 private resourceImages?:NativeResourceImages;private retainedResources:string[]=[];
 async retainFrameResources(program:NativeProgram){const files=(program.imports??[]).filter(i=>i.source==='declared-video').map(i=>i.file);await this.resourceImages?.retain(files);await this.resourceImages?.release(this.retainedResources);this.retainedResources=files;}
 async releaseFrameResources(program:NativeProgram){await this.resourceImages?.release((program.imports??[]).filter(i=>i.source==='declared-video').map(i=>i.file));}

 private stoppedEntries=new Set<string>();
 private entries=new Map<string,Awaited<ReturnType<typeof spiderMonkeyTransport>>>();
 private checkpointStages=new Set<string>();
 private stageKernelDigests=new WeakMap<NativeProgram['kernels'][number],string>();
 private stageSeedDigests=new WeakMap<NonNullable<NativeProgram['data']>[number],string>();
 private graphDecoders=new Map<string,NativeGraphDecoder>();
 private graphStageCount=1;private closed=false;private closing?:Promise<void>;private stagesClosing?:Promise<void>;private resourcesClosing?:Promise<void>;
 private residentSeeds=new Map<string,Map<string,NonNullable<NativeProgram['data']>[number]>>();private residentPool=new Map<string,NonNullable<NativeProgram['data']>[number]>();
 private initialSeedCounts=new Map<string,number>();
 private stageKernels=new Map<string,NativeProgram['kernels']>();private initialData=new Map<string,Map<number,NonNullable<NativeProgram['data']>[number]>>();
 constructor(private build:BuiltProject,private width:number,private height:number,private timeout=20000,private evidence?:NativeScopeEvidence,private allowWasm=false,private modelBudget=1024**3,private resourceLimits:Omit<NativeResourceOptions,'allowWasm'>={},private executeStateSegment?:ExecuteNativeStateSegment,private logicLimits:Pick<TransportOptions,'maxMessageBytes'|'maxMemoryBytes'>={},private logicalPreview=false,private graphTemplates=true,private stageCache=true){}
 async init(){
  const authored=stageDefinitions(this.build.manifest).filter(({stage})=>stage.engine==='native-gpu'&&stage.entry);
  this.graphStageCount=Math.max(1,authored.length);
  for(const {stage,key}of authored)await this.initializeStage(stage,key);
 }
 graphStats(){
  const totals={hits:0,builds:0,live:0,bytes:0,wireInBytes:0,wireOutBytes:0};
  for(const decoder of this.graphDecoders.values()){
   const row=decoder.stats();totals.hits+=row.hits;totals.builds+=row.builds;totals.live+=row.live;totals.bytes+=row.bytes;
  }
  for(const entry of this.entries.values()){
   const {bytesIn,bytesOut}=entry.stats();totals.wireInBytes+=bytesIn;totals.wireOutBytes+=bytesOut;
  }
  return totals;
 }
 private async initializeStage(stage:StageSpec,key:string,deadline=Date.now()+this.timeout){
  const bundleKey=key.startsWith('\0temporal:')?stage.id:key;
  const moduleResources=Object.keys(stage.props.$packages??{}).length?await sealedStageModuleResources(this.build,bundleKey,{maxBytes:this.resourceLimits.maxSourceBytes??this.modelBudget,maxResources:this.modelBudget}):undefined;
  const maxMessageBytes=this.logicLimits.maxMessageBytes??Math.min(0xffffffff,Math.max(64*1024**2,this.modelBudget));
  const options:TransportOptions={maxMessageBytes,maxMemoryBytes:this.logicLimits.maxMemoryBytes??Math.max(1024**3,maxMessageBytes*3),bundleFile:resolve(this.build.dir,this.build.stageBundles[bundleKey]),timeoutMs:Math.max(1,deadline-Date.now()),stageId:bundleKey,allowWasm:this.allowWasm,seed:(this.build.manifest.composition.seed^hashString(bundleKey))|0};
  const transport=await spiderMonkeyTransport(options);this.entries.set(key,transport);
  const resources=Object.fromEntries(this.build.manifest.resources.map(r=>[r.id,r.id]));
  const composition=this.build.manifest.composition;
  const logicalWidth=stage.width??composition.width,logicalHeight=stage.height??composition.height;
  const width=this.logicalPreview?logicalWidth:Math.round(logicalWidth*this.width/composition.width);
  const height=this.logicalPreview?logicalHeight:Math.round(logicalHeight*this.height/composition.height);
  const graphTemplateBudget=this.graphTemplates&&stage.seek==='stateless'&&!stage.composition&&!key.startsWith('\0temporal:')?
   Math.floor(Math.min(this.modelBudget,options.maxMemoryBytes!,maxMessageBytes)/(16*this.graphStageCount)):0;
  if(graphTemplateBudget>0)this.graphDecoders.set(key,new NativeGraphDecoder(graphTemplateBudget));
  const initialized=await this.call(key,'native.init',{width,height,graphTemplateBudget,seed:this.build.manifest.composition.seed,resources,engineVersion,temporalPolicy:{version:1,seek:stage.seek,inputs:Object.entries(stage.inputs).filter(([,v])=>isPortRef(v)&&this.build.manifest.stages.find(s=>s.id===v.$ref)?.outputs[v.port]==='surface').map(([k])=>k)},residentPolicy:{version:1,maxBytes:this.modelBudget},nativeScopeEvidence:this.evidence,...stage.composition?.mode==='explicit'?{stageCalls:{version:1}}:{},...moduleResources?{moduleResources,moduleResourceLimits:{maxBytes:this.resourceLimits.maxSourceBytes??this.modelBudget,maxResources:this.modelBudget}}:{}},deadline) as {seedScope?:{version:number;initialData:number};previewCheckpoint?:boolean};
  if(initialized?.previewCheckpoint===true&&!key.startsWith('\0temporal:')&&!moduleResources)this.checkpointStages.add(key);
  if(initialized?.seedScope!==undefined){const seed=initialized.seedScope;if(!seed||typeof seed!=='object'||Array.isArray(seed)||Object.keys(seed).some(k=>!['version','initialData'].includes(k))||seed.version!==1||!Number.isSafeInteger(seed.initialData)||seed.initialData<0)throw new EngineError('E_NATIVE_PROTOCOL','Invalid initialization seed scope');this.initialSeedCounts.set(key,seed.initialData);}return initialized;
 }
 private async call(id:string,method:string,payload:unknown,deadline=Date.now()+this.timeout,signal?:AbortSignal){
  const remaining=deadline-Date.now();if(remaining<=0)throw new EngineError('E_STAGE_TIMEOUT','Temporal frame exceeded its absolute deadline',{stageId:id});const entry=this.entries.get(id);if(!entry||this.closed)throw new EngineError('E_NATIVE_LOGIC_CLOSED','Native logic host is closed',{stageId:id});let timer:ReturnType<typeof setTimeout>|undefined,onAbort:(()=>void)|undefined;
  try{if(signal?.aborted)throw new EngineError('E_RENDER_CANCELLED','Native recording cancelled',{stageId:id});return await Promise.race([entry.call(method,payload),...signal?[new Promise<never>((_,reject)=>{onAbort=()=>{reject(new EngineError('E_RENDER_CANCELLED','Native recording cancelled',{stageId:id}));this.stoppedEntries.add(id);void entry.close();};signal.addEventListener('abort',onAbort,{once:true});})]:[],new Promise<never>((_,reject)=>{timer=setTimeout(()=>{reject(new EngineError('E_STAGE_TIMEOUT','Native JS/React logic exceeded its deadline',{stageId:id}));this.stoppedEntries.add(id);void entry.close();},remaining);})]);}
  catch(e){if(e instanceof EngineError)throw e;const message=(e as Error).message;throw new EngineError(message.match(/\[(E_[A-Z_]+)\]/)?.[1]??'E_NATIVE_LOGIC',message,{stageId:id});}
  finally{clearTimeout(timer);if(onAbort)signal?.removeEventListener('abort',onAbort);}
 }
 private async admitInferences(packet:Packet,stageKey:string,signal?:AbortSignal){
  const inferences=packet.inferences??[],previousInferences=this.stageInferences.get(stageKey);if(previousInferences&&JSON.stringify(previousInferences)!==JSON.stringify(inferences))throw new EngineError('E_INFERENCE_IDENTITY','Model declarations changed inside a running Stage');this.stageInferences.set(stageKey,inferences);const inferenceIds=this.inferenceIndices.get(stageKey)??[];
  while(inferenceIds.length<inferences.length){const local=inferenceIds.length;inferenceIds.push(this.inferencePool.push({...inferences[local],file:''})-1);}this.inferenceIndices.set(stageKey,inferenceIds);
  for(const p of packet.passes){if(p.inference===undefined)continue;const spec=inferences[p.inference],global=inferenceIds[p.inference];if(!spec||global===undefined)throw new EngineError('E_INFERENCE_IDENTITY','Unknown model token');if(!this.inferencePool[global].file){this.resourceImages??=await NativeResourceImages.create(this.build,undefined,{maxBytes:this.modelBudget,...this.resourceLimits,allowWasm:this.allowWasm});this.inferencePool[global]={...spec,file:await this.resourceImages.model(spec,this.modelBudget,signal)};}}
  return inferenceIds;
 }
 previewCheckpointSupported(){
  return this.entries.size>0&&this.checkpointStages.size===this.entries.size&&this.stoppedEntries.size===0;
 }
 async capturePreviewState(budget:number){
  if(!this.previewCheckpointSupported())return;
  const states=new Map<string,Uint8Array>();
  const deadline=Date.now()+this.timeout;
  let bytes=0;
  for(const id of this.checkpointStages){
   const overhead=128+2*id.length,remaining=Math.min(budget-bytes-overhead,(this.logicLimits.maxMessageBytes??0xffffffff)-256);
   if(remaining<1)return;
   try{
    const state=await this.call(id,'native.preview.capture',{bytes:remaining},deadline);
    if(!(state instanceof Uint8Array)||state.byteLength>remaining)
     throw new EngineError('E_NATIVE_PREVIEW_CHECKPOINT_DATA','Invalid Stage checkpoint response',{stageId:id});
    states.set(id,state);
    bytes+=overhead+state.byteLength;
   }catch(error){
    if(error instanceof EngineError&&['E_NATIVE_PREVIEW_CHECKPOINT_UNSUPPORTED','E_NATIVE_PREVIEW_CHECKPOINT_DATA'].includes(error.code))return;
    throw error;
   }
  }
  return {states,bytes};
 }
 async restorePreviewState(states:NativePreviewLogicState){
  if(!this.previewCheckpointSupported()||states.size!==this.checkpointStages.size||[...states.keys()].some(id=>!this.checkpointStages.has(id)))
   throw new EngineError('E_NATIVE_PREVIEW_CHECKPOINT_UNSUPPORTED','The Stage snapshot does not match this owner');
  const deadline=Date.now()+this.timeout;
  for(const [id,state]of states)await this.call(id,'native.preview.restore',state,deadline);
 }
 /** Explicit React reset; callers replay with the existing frame contexts. */
 async resetStage(stageId:string){await this.call(stageId,'native.reset',{});}
 async record(frame:number,signal?:AbortSignal,execution?:FrameExecution,quality?:PreviewQuality){const snapshot=captureFrameExecution(execution,this.build.manifest.stages.map(s=>s.id));assertSharedExecution(this.build.manifest.stages,snapshot);try{return await this.recordPlan(frame,signal,undefined,snapshot,quality);}catch(error){if(error instanceof EngineError&&error.frame===undefined)throw new EngineError(error.code,error.message,{stageId:error.stageId,frame,hint:error.hint,details:error.details});throw error;}}
 private async recordPlan(frame:number,signal?:AbortSignal,branch?:{target:string;deadline:number},execution?:FrameExecution,quality?:PreviewQuality):Promise<{program:NativeProgram;parameters:number[][];output:number;stageCache:NativeStageCacheRef[];valueOutputs:Record<string,Record<string,import('../../src/core/types.ts').Json>>}>{
  const frameDeadline=branch?.deadline??Date.now()+this.timeout;const checkCancellation=()=>{if(signal?.aborted)throw new EngineError('E_RENDER_CANCELLED','Native recording cancelled',{frame});};checkCancellation();

  const tvg=this.build.manifest,needed=new Set<string>();if(branch){const visit=(id:string)=>{if(needed.has(id))return;const stage=tvg.stages.find(s=>s.id===id);if(!stage||stage.engine!=='native-gpu'||stage.props[CONFIG]||!stage.entry&&stage.seek!=='stateless')throw new EngineError('E_NATIVE_TEMPORAL_SOURCE_UNSUPPORTED','Upstream branch must be a declared Native source without shared transactions');needed.add(id);for(const value of Object.values(stage.inputs))if(isPortRef(value)){if(value.port!=='surface')throw new EngineError('E_NATIVE_TEMPORAL_SOURCE_UNSUPPORTED','Temporal branch accepts only declared surface dependencies');visit(value.$ref);}};visit(branch.target);}
  const scale=quality?.resolutionScale??1;
  const width=Math.max(1,Math.round(this.width*scale)),height=Math.max(1,Math.round(this.height*scale));
  const residentLive=new Map<string,Set<string>>();
  const stageCache:NativeStageCacheRef[]=[],cachedImages=new Map<number,string>();
  const temporalLeases=new Map<number,{result:{program:NativeProgram;parameters:number[][];output:number};owner:string;image?:number}>();let nextLease=Number.MAX_SAFE_INTEGER;
  const program:NativeProgram={version:2,session:randomBytes(32).toString('hex'),slots:2,maxBytes:1024**3,images:[],data:[],kernels:[],passes:[],display:null},parameters:number[][]=[],outputs=new Map<string,number>(),values=new Map<string,PortValue>();
  try{
  if(this.modulePool.length)program.modules=[...this.modulePool];if(this.inferencePool.length)program.inferences=[...this.inferencePool];if(!branch)program.data=[...this.statePool.values(),...this.residentPool.values()];
  let callSerial=0;
  const rememberAuthoredImage=(first:number,firstData:number,image:number,stageKey:string,context:FrameContext)=>{
   const pass=program.passes.length-1;
   if(pass<first||program.passes[pass].buffers||program.passes[pass].output!==image)return;
   const local=new Map<number,number>(),scratch=new Map<number,number>();
   const graph=[];
   const source=(i:number)=>local.get(i)??cachedImages.get(i);
   for(let i=first;i<=pass;i++){
    const p=program.passes[i],k=program.kernels[p.kernel];
    if(!k||p.draw||p.module!==undefined||p.inference!==undefined||p.state||p.rayBuild||p.rayQuery!==undefined)return;
    if(p.buffers?k.kind!=='compute':p.groups||k.replayImage!=='whole-output-v1')return;
    let kernel=this.stageKernelDigests.get(k);
    if(kernel===undefined){kernel=hashValue(k);this.stageKernelDigests.set(k,kernel);}
    const images=p.inputs.map(source);
    if(images.some(x=>x===undefined))return;
    const data=[];
    for(const index of p.buffers??p.data??[]){
     const d=program.data![index];
     if(!d)return;
     if(d.sourceImage!==undefined){
      const id=source(d.sourceImage);
      if(id===undefined)return;
      data.push(['view',id,d.type,d.length]);
     }else{
      if(d.persistent||d.resident||d.sourceResource||!d.immutable&&index<firstData)return;
      let digest=this.stageSeedDigests.get(d);
      if(digest===undefined){digest=hashValue([d.type,d.length,d.initial]);this.stageSeedDigests.set(d,digest);}
      if(d.immutable)data.push(['immutable',digest]);
      else{
       let id=scratch.get(index);
       if(id===undefined){id=scratch.size;scratch.set(index,id);}
       data.push(['scratch',id,digest]);
      }
     }
    }
    graph.push([kernel,p.buffers?p.groups:program.images[p.output],p.header,parameters[i],images,data]);
    if(!p.buffers)local.set(p.output,i-first);
   }
   const key=hashValue(['native-authored-image-v1',this.build.hash,stageKey,context,quality??null,graph]);
   stageCache.push({first,pass,key});
   cachedImages.set(image,key);
  };
  const bindInputs=(stage:StageSpec,boundary:NativePortPacket,local:Map<string,NativePortPacket>):NativePortPacket=>{
   const ports:NativePortPacket={values:Object.create(null),images:Object.create(null)};
   for(const [name,value]of Object.entries(stage.inputs)){
    if(isStageInput(value)){if(Object.hasOwn(boundary.images,value.$input))ports.images[name]=boundary.images[value.$input];else if(Object.hasOwn(boundary.values,value.$input))ports.values[name]=boundary.values[value.$input];else throw new EngineError('E_INPUT_MISSING','Enclosing input is unavailable',{stageId:stage.id,details:{port:name}});}
    else if(isPortRef(value)){const source=local.get(value.$ref);if(source&&Object.hasOwn(source.images,value.port))ports.images[name]=source.images[value.port];else if(source&&Object.hasOwn(source.values,value.port))ports.values[name]=source.values[value.port];else throw new EngineError('E_INACTIVE_INPUT','Declared producer has not published this port',{stageId:stage.id,frame});}
    else ports.values[name]=value;
   }return ports;
  };
  const executeStage=async(stage:StageSpec,path:string[],context:FrameContext,inputs:NativePortPacket):Promise<NativePortPacket>=>{
   checkCancellation();if(Date.now()>=frameDeadline)throw new EngineError('E_STAGE_TIMEOUT','Composite frame exceeded its absolute deadline',{stageId:stageScopeKey(path),frame});
   const invocation=++callSerial,stageKey=branch?'\0temporal:'+stage.id:stageScopeKey(path),props=frameStageProps(evaluate(stage.props,context) as Record<string,unknown>,stageKey,execution);
   assertNativePorts(stageKey,stage.inputTypes??{},inputs,program.images);
   if(stage.engine!=='native-gpu')throw new EngineError('E_NATIVE_MIGRATION','Unknown visual backend',{stageId:stageKey});
   if(branch&&stage.composition)throw new EngineError('E_NATIVE_TEMPORAL_SOURCE_UNSUPPORTED','Composite source forks require an explicit replay contract',{stageId:stageKey});
   if(stage.composition?.mode==='auto'){
    const local=new Map<string,NativePortPacket>();
    for(const child of topologicalLevels(stage.composition.stages).flat()){
     if(!isActive(child,context.frame))continue;
     const childPath=[...path,child.id],ports=await executeStage(child,childPath,childFrameContext(context,child,stageScopeKey(childPath),tvg.composition.seed),bindInputs(child,inputs,local));local.set(child.id,ports);
    }
    const result:NativePortPacket={images:Object.create(null),values:Object.create(null)};
    for(const [name,ref]of Object.entries(stage.composition.publish??{})){const value=local.get(ref.$ref);if(value&&Object.hasOwn(value.images,ref.port))result.images[name]=value.images[ref.port];else if(value&&Object.hasOwn(value.values,ref.port))result.values[name]=value.values[ref.port];else throw new EngineError('E_INACTIVE_INPUT','Composite output producer is unavailable',{stageId:stageKey,frame});}
    assertNativePorts(stageKey,stage.outputs,result,program.images,'output');return result;
   }
   if(stage.entry){
    if(branch&&!this.entries.has(stageKey)){const ready=await this.initializeStage(stage,stageKey,frameDeadline) as {temporalSeek?:boolean};if(!ready?.temporalSeek)throw new EngineError('E_NATIVE_TEMPORAL_SOURCE_UNSUPPORTED','JS producer needs an explicit isolated-seek-v1 hook',{stageId:stage.id});}
    const deadline=frameDeadline;let continuation=randomBytes(32).toString('hex'),lastRequest=0;
    const recordedImages:number[]=[],recordedData:number[]=[],recordedKernels:number[]=[],recordedResources=new Map<number,string>(),recordedBinary=new Map<number,string>(),frameSeeds=new Map<number,NonNullable<NativeProgram['data']>[number]>();
    const grantedImages=new Set<number>();
    const appendPacket=async(packet:Packet,metadataBytes?:number)=>{

    if(branch&&(packet.data?.some(d=>d.persistent||d.resident)||packet.bufferOutputs?.length||packet.passes?.some(p=>p.state)))throw new EngineError('E_NATIVE_TEMPORAL_SOURCE_UNSUPPORTED','GPU history/publications require a qualified fork/checkpoint contract; canonical state is never sampled implicitly');
    if(packet.version!==1)throw new EngineError('E_NATIVE_PROTOCOL','Unsupported Native command packet',{stageId:stage.id});
    if(metadataBytes===undefined)assertNativeMetadata(packet,this.modelBudget,{stageId:stage.id});
    else assertNativeMetadataBytes(metadataBytes,this.modelBudget,{stageId:stage.id});
    // Reconcile a completed RPC's deltas even when cancelled during the call;
    // the host has already advanced its kernel/immutable-seed offsets.
    const kernels=this.stageKernels.get(stageKey)??[];if(packet.kernelOffset!==kernels.length)throw new EngineError('E_NATIVE_PROTOCOL','Stale native kernel delta');for(const k of packet.kernels)kernels.push(k);this.stageKernels.set(stageKey,kernels);
    const modules=this.stageModules.get(stageKey)??[];
    if(packet.modules){if(packet.moduleOffset!==modules.length||!Number.isSafeInteger(modules.length+packet.modules.length))throw new EngineError('E_NATIVE_PROTOCOL','Stale or unbounded native module delta');for(const m of packet.modules)modules.push(m);this.stageModules.set(stageKey,modules);}
    else if(packet.moduleOffset!==undefined||modules.length)throw new EngineError('E_NATIVE_PROTOCOL','Missing native module delta');
    const moduleIds=this.moduleIndices.get(stageKey)??[];while(moduleIds.length<modules.length)moduleIds.push(this.modulePool.push(modules[moduleIds.length])-1);this.moduleIndices.set(stageKey,moduleIds);
    if(this.modulePool.length)program.modules=[...this.modulePool];
    if(packet.passes.some(p=>p.module!==undefined&&moduleIds[p.module]===undefined))throw new EngineError('E_NATIVE_PROTOCOL','Unknown native module reference');
    const inferenceIds=await this.admitInferences(packet,stageKey,signal);if(this.inferencePool.length)program.inferences=[...this.inferencePool];
    const initial=this.initialData.get(stageKey)??new Map<number,NonNullable<NativeProgram['data']>[number]>();this.initialData.set(stageKey,initial);
    const resident=this.residentSeeds.get(stageKey)??new Map<string,NonNullable<NativeProgram['data']>[number]>();this.residentSeeds.set(stageKey,resident);
    packet.residentLive??=[];if(!Array.isArray(packet.residentLive)||new Set(packet.residentLive).size!==packet.residentLive.length||packet.residentLive.some(id=>typeof id!=='string'))throw new EngineError('E_NATIVE_RESIDENT_PROTOCOL','Expected a unique live resident set');
    const data=restoreNativeDataSeeds(packet.data,this.initialSeedCounts.get(stageKey),initial,frameSeeds,resident);
    const residentKey=(id:string)=>Buffer.from(stageKey).toString('hex')+'~'+id;
    for(const id of [...resident.keys()])if(!packet.residentLive.includes(id)){this.residentPool.delete(residentKey(id));}
    residentLive.set(stageKey,new Set(packet.residentLive));
    for(const id of packet.residentLive){const d=resident.get(id);if(!d)throw new EngineError('E_NATIVE_RESIDENT_SEED','Live resident identity has no seed');if(!this.residentPool.has(residentKey(id)))this.residentPool.set(residentKey(id),{...d,resident:{version:1,id:residentKey(id)}});}

    const allowedInputs=new Set([...Object.values(inputs.images).map(v=>v.image),...grantedImages]);
    for(const external of Object.values(packet.external)){const lease=temporalLeases.get(external);if(lease?.owner===stageKey){lease.image??=appendTemporalProgram(program,parameters,lease.result);allowedInputs.add(external);}}
    const externalImage=(id:number)=>temporalLeases.get(id)?.image??id;
    const passBase=program.passes.length;const mapping=packet.images.map((image,i)=>{const external=packet.external[i];if(external!==undefined){if(!allowedInputs.has(external)||JSON.stringify(image)!==JSON.stringify(program.images[externalImage(external)]))throw new EngineError('E_NATIVE_PROTOCOL','Foreign or incompatible native input');return recordedImages[i]=externalImage(external);}const known=recordedImages[i];if(known!==undefined){if(JSON.stringify(program.images[known])!==JSON.stringify(image))throw new EngineError('E_NATIVE_PROTOCOL','Continued image metadata changed');return known;}return recordedImages[i]=program.images.push(image)-1;});
    for(const value of packet.resourceImages??[]){const key=JSON.stringify(value.source),known=recordedResources.get(value.image);if(known!==undefined){if(key!==known)throw new EngineError('E_NATIVE_RESOURCE','Continued resource identity changed');continue;}recordedResources.set(value.image,key);if(mapping[value.image]===undefined||packet.external[value.image]!==undefined)throw new EngineError('E_NATIVE_RESOURCE','Invalid declared resource image');this.resourceImages??=await NativeResourceImages.create(this.build,undefined,{maxBytes:this.modelBudget,...this.resourceLimits,allowWasm:this.allowWasm});if(value.source.decode==='video'&&value.source.decoder==='hardware'){(program.imports??=[]).push({image:mapping[value.image],...await this.resourceImages.hardwareVideo(value.source,signal)});continue;}const file=await this.resourceImages.image(value.source,signal);(program.imports??=[]).push({image:mapping[value.image],file,source:value.source.decode==='video'?'declared-video':'declared-resource',...value.source.decode==='video'?{stream:value.source.id}:{}});}
    for(const item of packet.resourceBuffers??[]){const d=data[item.buffer],key=JSON.stringify(item.source),known=recordedBinary.get(item.buffer);if(known!==undefined){if(known!==key)throw new EngineError('E_NATIVE_BINARY_PERMISSION','Continued binary resource changed');data[item.buffer]={...d,sourceResource:program.data![recordedData[item.buffer]].sourceResource};continue;}recordedBinary.set(item.buffer,key);if(!Number.isInteger(item.buffer)||!d||d.type!=='u32'||!d.immutable||d.initial.length||d.sourceImage!==undefined||d.persistent||d.sourceResource)throw new EngineError('E_NATIVE_BINARY_PERMISSION','Expected a unique read-only binary resource buffer');this.resourceImages??=await NativeResourceImages.create(this.build,undefined,{maxBytes:this.modelBudget,...this.resourceLimits,allowWasm:this.allowWasm});const sourceResource=await this.resourceImages.binary(item.source,this.modelBudget,signal);if(d.length!==Math.ceil(sourceResource.byteLength/4))throw new EngineError('E_NATIVE_BINARY_LENGTH','Resource range differs from buffer allocation');data[item.buffer]={...d,sourceResource};}
    while(recordedKernels.length<kernels.length)recordedKernels.push(program.kernels.push(kernels[recordedKernels.length])-1);const dataIds=data.map((d,i)=>{if(recordedData[i]!==undefined){const old=program.data![recordedData[i]],candidate={...d,...d.resident?{resident:{version:1,id:residentKey(d.resident.id)}}:{},...d.persistent?{persistent:{...d.persistent,id:Buffer.from(stageKey).toString('hex')+'~'+d.persistent.id}}:{},...d.sourceImage!==undefined?{sourceImage:mapping[d.sourceImage]}:{}};if(JSON.stringify(old)!==JSON.stringify(candidate))throw new EngineError('E_NATIVE_PROTOCOL','Continued data definition changed');return recordedData[i];}if(d.resident){const key=residentKey(d.resident.id),definition=this.residentPool.get(key)??{...d,resident:{version:1 as const,id:key}},index=program.data!.findIndex(v=>v.resident?.id===key);return recordedData[i]=index>=0?index:program.data!.push(definition)-1;}if(d.persistent){const id=Buffer.from(stageKey).toString('hex')+'~'+d.persistent.id,known=this.statePool.get(id);let spec=this.stateDefinitions.get(d);if(!spec){spec={...d,persistent:{...d.persistent,id}};if(known&&JSON.stringify(known)!==JSON.stringify(spec))throw new EngineError('E_NATIVE_STATE_RECONFIGURE','Persistent state definition changed');this.stateDefinitions.set(d,spec);}if(!known)this.statePool.set(id,spec);const index=program.data!.findIndex(v=>v.persistent?.id===id);return recordedData[i]=index>=0?index:program.data!.push(known??spec)-1;}if(d.sourceImage!==undefined){if(!Number.isInteger(d.sourceImage)||mapping[d.sourceImage]===undefined)throw new EngineError('E_NATIVE_PROTOCOL','Unknown image data view');d={...d,sourceImage:mapping[d.sourceImage]};}return recordedData[i]=program.data!.push(d)-1;});
    for(const p of packet.passes)program.passes.push(({...p,kernel:recordedKernels[p.kernel],output:mapping[p.output]??0,inputs:p.inputs.map(i=>mapping[i]),...p.module===undefined?{}:{module:moduleIds[p.module]},...p.inference===undefined?{}:{inference:inferenceIds[p.inference]},...p.rayQuery===undefined?{}:{rayQuery:p.rayQuery+passBase},...p.rayBuild?{rayBuild:{...p.rayBuild,transforms:dataIds[p.rayBuild.transforms],geometries:p.rayBuild.geometries.map(g=>({...g,positions:dataIds[g.positions],...g.indices===undefined?{}:{indices:dataIds[g.indices]}}))}}:{},...p.buffers?{buffers:p.buffers.map(i=>dataIds[i])}:{},...p.data?{data:p.data.map(i=>dataIds[i])}:{},...p.draw?{draw:{...p.draw,positions:dataIds[p.draw.positions],...p.draw.indices===undefined?{}:{indices:dataIds[p.draw.indices]},...p.draw.uvs===undefined?{}:{uvs:dataIds[p.draw.uvs]}}}:{}}));for(const p of packet.parameters)parameters.push(p);
    for(const out of packet.bufferOutputs??[]){if(out.version!==1||dataIds[out.buffer]===undefined||!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(out.id))throw new EngineError('E_NATIVE_DATA_OUTPUT','Invalid buffer publication');const id=(path.length>1?stageKey+'/call-'+invocation:stage.id)+'/'+out.id,known=program.bufferOutputs?.find(v=>v.id===id);if(known){if(known.buffer!==dataIds[out.buffer]||JSON.stringify(known.info)!==JSON.stringify(out.info))throw new EngineError('E_NATIVE_DATA_OUTPUT','Continued publication changed');}else(program.bufferOutputs??=[]).push({...out,id,buffer:dataIds[out.buffer]});}
     return mapping;
    };
    const logicalWidth=stage.width??tvg.composition.width,logicalHeight=stage.height??tvg.composition.height;
    const renderWidth=Math.max(1,Math.round(logicalWidth*width/tvg.composition.width));
    const renderHeight=Math.max(1,Math.round(logicalHeight*height/tvg.composition.height));
    const stageContext=quality?{...context,preview:{...quality,logicalWidth,logicalHeight,renderWidth,renderHeight,
     scaleX:renderWidth/logicalWidth,scaleY:renderHeight/logicalHeight}}:context;
    let reply=await this.call(stageKey,branch?'native.temporal.sample':'native.render',{context:stageContext,inputs,props,continuation},deadline,signal) as any;
    let splitExecution=false;
    while(reply?.kind==='native-temporal-request'||reply?.kind==='native-state-segment'||reply?.kind==='native-stage-call'){
     if(reply.kind==='native-stage-call'){
      if(branch||stage.composition?.mode!=='explicit'||reply.version!==1||reply.continuation!==continuation||!Number.isSafeInteger(reply.id)||reply.id<=lastRequest||typeof reply.stageId!=='string')throw new EngineError('E_STAGE_CALL_PROTOCOL','Foreign or stale child execution scope',{stageId:stageKey});lastRequest=reply.id;
      const nextContinuation=randomBytes(32).toString('hex');let answer:Record<string,unknown>,childFailure:EngineError|undefined;
      try{
       const mapping=await appendPacket(reply.packet),child=stage.composition.stages.find(s=>s.id===reply.stageId);if(!child)throw new EngineError('E_STAGE_REFERENCE','Only directly declared child Stages are callable',{stageId:stageKey,details:{child:reply.stageId}});
       const ports:NativePortPacket={values:reply.inputs?.values,images:Object.create(null)};
       if(!reply.inputs?.images||Object.keys(reply.inputs).some(k=>!['values','images'].includes(k)))throw new EngineError('E_STAGE_CALL_PORTS','Invalid child input packet');
       for(const [name,v]of Object.entries(reply.inputs.images) as [string,any][]){if(!Number.isSafeInteger(v.image)||mapping[v.image]===undefined||JSON.stringify(v.info)!==JSON.stringify({version:1,...program.images[mapping[v.image]]}))throw new EngineError('E_STAGE_CALL_PROTOCOL','Child input is outside the enclosing image scope');ports.images[name]={image:mapping[v.image],info:v.info};}
       const childCallId=program.session+'/'+(++callSerial),childPath=[...path,child.id],childContext=childFrameContext(context,child,stageScopeKey(childPath),tvg.composition.seed),result=await executeStage(child,childPath,childContext,ports);
       for(const value of Object.values(result.images))grantedImages.add(value.image);
       answer={result:{version:1,callId:childCallId,stageId:child.id,context:childContext,outputs:result,cacheHit:false}};
      }catch(error){const issue=error instanceof EngineError?error:new EngineError('E_STAGE_CALL_FAILED',String(error));childFailure=new EngineError(issue.code,issue.message,{stageId:issue.stageId??stageScopeKey([...path,reply.stageId]),frame,details:{callPath:[...path,reply.stageId],cause:issue.details}});answer={error:{code:issue.code,message:issue.message}};}
      try{reply=await this.call(stageKey,'native.temporal.resume',{version:1,id:reply.id,continuation,nextContinuation,...answer},deadline,signal);}catch(error){throw signal?.aborted?error:childFailure??error;}continuation=nextContinuation;continue;
     }
     if(reply.kind==='native-state-segment'){
      splitExecution=true;
      if(branch||!this.executeStateSegment)throw new EngineError('E_NATIVE_SEGMENT_PROFILE','State continuation is unavailable in temporal source forks');
      if(reply.version!==1||reply.continuation!==continuation||!Number.isSafeInteger(reply.id)||reply.id<=lastRequest)throw new EngineError('E_NATIVE_SEGMENT_PROTOCOL','Foreign or stale state continuation');lastRequest=reply.id;
      const nextContinuation=randomBytes(32).toString('hex');let error:Record<string,string>|undefined;
      try{checkCancellation();await appendPacket(reply.packet);if(program.passes.some(p=>p.module!==undefined||p.draw||p.rayBuild||p.rayQuery!==undefined))throw new EngineError('E_NATIVE_SEGMENT_PROFILE','Image/tensor continuation does not qualify modules, mesh or ray commands');if(!program.images.length)program.images.push({width:1,height:1,format:'rgba32float',alpha:'opaque',color:{version:1,primaries:'rec709',transfer:'linear',reference:'scene',range:'full',referenceWhiteNits:100}});this.resourceImages?.configure(program);const images=program.images.length,data=program.data!.length,segment={frame,parameters:[...parameters],program:{...program,images:[...program.images],data:[...program.data!],kernels:[...program.kernels],passes:[...program.passes],version:2 as const,stateContinuation:true as const,slots:1,bufferOutputs:[],imageAllocations:program.images.map((_,i)=>i),imports:program.imports?.filter(v=>v.image>=(program.frameContinuation?.images??0))}};await this.executeStateSegment(segment,signal);program.frameContinuation={version:1,frame,images,data};program.passes=[];parameters.length=0;checkCancellation();}catch(e){const issue=e instanceof EngineError?e:new EngineError('E_NATIVE_SEGMENT_FAILED',String(e));error={code:issue.code,message:issue.message};}
      reply=await this.call(stageKey,'native.temporal.resume',{version:1,id:reply.id,continuation,nextContinuation,...error?{error}:{}},deadline,signal);continuation=nextContinuation;continue;
     }

     const request=reply as TemporalInputRequest;
     if(branch){await this.call(stageKey,'native.temporal.cancel',{continuation},deadline);throw new EngineError('E_NATIVE_TEMPORAL_SOURCE_UNSUPPORTED','Nested temporal replay inside a source seek hook is unsupported');}
     if(request.version!==1||request.continuation!==continuation||!Number.isSafeInteger(request.id)||request.id<=lastRequest||!['consumer-local','composition'].includes(request.clock)||typeof request.input!=='string')throw new EngineError('E_NATIVE_TEMPORAL_PROTOCOL','Foreign, duplicate or stale continuation');lastRequest=request.id;
     const nextContinuation=randomBytes(32).toString('hex');let answer:Record<string,unknown>;
     try{checkCancellation();const ref=stage.inputs[request.input],c=request.context;if(!isPortRef(ref)||ref.port!=='surface'||!c||c.seed!==context.seed||c.fps.num!==context.fps.num||c.fps.den!==context.fps.den||c.dt!==context.dt||c.durationInFrames!==context.durationInFrames||![c.time,c.globalTime,c.frame,c.globalFrame,c.progress].every(Number.isFinite))throw new EngineError('E_NATIVE_TEMPORAL_RESOURCE','Source request must match this Stage clock and a declared input');
      const result=await this.recordPlan(temporalGlobalFrame(stage,c,request.clock),signal,{target:ref.$ref,deadline},undefined,quality),image=nextLease--;temporalLeases.set(image,{result,owner:stageKey});answer={image,info:{version:1,...result.program.images[result.output]}};
     }catch(error){const issue=error instanceof EngineError?error:new EngineError('E_NATIVE_TEMPORAL_SOURCE_FAILED',String(error));answer={error:{code:issue.code,message:issue.message}};}
     reply=await this.call(stageKey,'native.temporal.resume',{version:1,id:request.id,continuation,nextContinuation,...answer},deadline,signal);continuation=nextContinuation;
    }
     const decoded=this.graphDecoders.get(stageKey)?.expand(reply as NativeGraphPacket),packet=decoded?.packet??reply as Packet;
     const first=program.passes.length,firstData=program.data!.length;
     const mapping=await appendPacket(packet,decoded?.metadataBytes),raw=packet.portOutputs??{values:{},images:{surface:{image:packet.output,info:{version:1,...packet.images[packet.output]}}}},result:NativePortPacket={values:raw.values,images:Object.create(null)};
     for(const [name,value]of Object.entries(raw.images)){if(mapping[value.image]===undefined||JSON.stringify(value.info)!==JSON.stringify({version:1,...program.images[mapping[value.image]]}))throw new EngineError('E_STAGE_CALL_PROTOCOL','Output image is outside the Stage scope');result.images[name]={image:mapping[value.image],info:value.info};}
     assertNativePorts(stageKey,stage.outputs,result,program.images,'output');
     if(this.stageCache&&!branch&&!splitExecution&&!stage.composition&&!Object.hasOwn(stage.props,CONFIG)&&!packet.bufferOutputs?.length&&
        stage.seek==='stateless'&&stage.props.nativeCache==='deterministic-v1'){
      const surfaces=Object.values(result.images);
      if(surfaces.length===1)rememberAuthoredImage(first,firstData,surfaces[0].image,stageKey,context);
     }
     return result;
   }else{
    const d=props.nativePixel as NativePixelDescription;if(!d||d.version!==1)throw new EngineError('E_NATIVE_MIGRATION','Native declarative Stage needs nativePixel or a native factory',{stageId:stage.id});
    const info=pixelInfo({...d.output,width:this.logicalPreview?(stage.width??tvg.composition.width):Math.round((stage.width??tvg.composition.width)*this.width/tvg.composition.width),height:this.logicalPreview?(stage.height??tvg.composition.height):Math.round((stage.height??tvg.composition.height)*this.height/tvg.composition.height)}),kernel=program.kernels.push({replayImage:'whole-output-v1',code:nativePixelShader(d.kernel),inputCount:d.kernel.inputCount,headerWords:32,parameterWords:d.kernel.parameterWords})-1,ids=d.inputOrder.map(name=>inputs.images[name]?.image),header=Array<number>(32).fill(0);
    header.splice(0,4,info.width,info.height,Number(info.format==='rgba16float'),info.alpha==='premultiplied'?0:info.alpha==='straight'?1:2);ids.forEach((i,n)=>{const v=program.images[i];if(!v)throw new EngineError('E_NATIVE_INPUT','Unavailable native image');header.splice(4*(n+1),4,v.width,v.height,v.alpha==='premultiplied'?0:v.alpha==='straight'?1:2,0);});
    const {version:_v,...metadata}=info,output=program.images.push(metadata)-1;
    const pass=program.passes.push({kernel,inputs:ids,output,header})-1;
    const words=nativeParameters(stage,props,d);
    parameters.push(words);
    if(this.stageCache&&!branch&&stage.seek==='stateless'&&stage.props.nativeCache==='deterministic-v1'&&
       ids.every(id=>id!==undefined&&cachedImages.has(id))){
     const key=hashValue(['native-pixel-stage-v1',stageKey,context,quality??null,metadata,program.kernels[kernel],words,ids.map(id=>cachedImages.get(id!)!)]);
     stageCache.push({pass,key});
     cachedImages.set(output,key);
    }
    const result:NativePortPacket={values:{},images:{surface:{image:output,info:{version:1,...metadata}}}};
    assertNativePorts(stageKey,stage.outputs,result,program.images,'output');
    return result;
   }
   };
   const published=new Map<string,NativePortPacket>();
   for(const stage of topologicalLevels(tvg.stages).flat()){
    if(branch&&!needed.has(stage.id))continue;
    if(stage.engine==='audio'||!isActive(stage,frame)){if(branch)throw new EngineError('E_NATIVE_TEMPORAL_RANGE','Producer dependency inactive at sample time',{stageId:stage.id});continue;}
    const context=branch?temporalFrameContext(tvg,stage,frame):frameContext(tvg,stage,frame),result=await executeStage(stage,[stage.id],context,bindInputs(stage,{values:{},images:{}},published));published.set(stage.id,result);
    for(const [name,value]of Object.entries(result.images))outputs.set(stage.id+':'+name,value.image);
   }
   checkCancellation();
   const output=branch?outputs.get(branch.target+':surface')!:appendNativeComposite(program,parameters,{...tvg,layers:evaluate(tvg.layers,compositionContext(tvg,frame))},frame,outputs,width,height);
  if(program.frameContinuation){program.imports=program.imports?.filter(v=>v.image>=program.frameContinuation!.images);program.imageAllocations=program.images.map((_,i)=>i);}this.resourceImages?.configure(program);
  return {program,parameters,output,stageCache,valueOutputs:Object.fromEntries([...published].map(([id,ports])=>[id,structuredClone(ports.values)]))};
  }catch(e){await this.releaseFrameResources(program);throw e;}finally{for(const [stage,live]of residentLive)for(const id of this.residentSeeds.get(stage)?.keys()??[])if(!live.has(id))this.residentSeeds.get(stage)!.delete(id);for(const lease of temporalLeases.values())if(lease.image===undefined)await this.releaseFrameResources(lease.result.program);}
 }
 /** Dispose authored stages while the GPU owner still exists. Resource files may
  * still be pinned by queued work/ORT and are released by the Renderer afterwards. */
 closeStages():Promise<void>{return this.stagesClosing??=(async()=>{const disposed=await Promise.allSettled([...this.entries.keys()].filter(id=>!this.stoppedEntries.has(id)).map(id=>this.call(id,'dispose',{})));this.closed=true;const transports=await Promise.allSettled([...this.entries.values()].map(e=>e.close()));this.entries.clear();this.graphDecoders.clear();const failed=[...disposed,...transports].find((r):r is PromiseRejectedResult=>r.status==='rejected');if(failed)throw failed.reason;})();}
 closeResources():Promise<void>{return this.resourcesClosing??=(async()=>{await this.resourceImages?.close();})();}
 close():Promise<void>{return this.closing??=(async()=>{const stages=await Promise.allSettled([this.closeStages()]),resources=await Promise.allSettled([this.closeResources()]);const failed=[...stages,...resources].find((r):r is PromiseRejectedResult=>r.status==='rejected');if(failed)throw failed.reason;})();}
}
