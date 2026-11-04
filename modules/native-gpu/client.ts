import {residentWireProgram} from './resident-buffers.ts';
import type {NativeInferenceDefinition} from '../inference/native.ts';
import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {EngineError} from '../../src/core/errors.ts';
import type {NativeModuleSource} from './module.ts';
import type {NativeBufferOutput} from './data-output.ts';
import {assertNativeMetadata} from './capacity.ts';
import {binarySeedRequest,nativeTransportLimits,type NativeTransportLimits} from './seed-transport.ts';
import type {NativeMediaExport} from './media-export.ts';
import {nativeOwnerEnvironment} from './executable.ts';

/** Private command protocol. No native pointers, Web GPUTexture or CPU Surfaces. */
export interface NativeProgram {
 version:1|2;session:string;slots:number;maxBytes:number;previewReuse?:'declarative-regions-v1';rayQuery?:true;stateContinuation?:true;frameContinuation?:{version:1;frame:number;images:number;data:number};
 images:{width:number;height:number;format:string;alpha:string;color:unknown;storage?:'packed-f16-v1'}[];
 kernels:{code:string;inputCount:number;parameterWords:number;headerWords:number;packedMask?:number;replayImage?:'whole-output-v1';kind?:'compute'|'mesh'|'raster'|'module'|'state'|'color'|'inference'|'ray-build'|'ray-query';targetFormat?:'rgba16float'|'rgba32float';meshMode?:'cutout'|'source-over'|'depth-peel'}[];
 passes:{kernel:number;inputs:number[];output:number;header:number[];data?:number[];buffers?:number[];groups?:[number,number,number];draw?:{positions:number;indices?:number;uvs?:number;textureVersion?:1;count:number};module?:number;inference?:number;rayBuild?:import('./rays.ts').NativeRayDefinition;rayQuery?:number;state?:true}[];
 modules?:NativeModuleSource[];
 bufferOutputs?:NativeBufferOutput[];
 dataExport?:{version:1;directory:string};
 resourceLease?:{version:1;directory:string};
 data?:{length:number;type:'f32'|'u32'|'i32';initial:number[];immutable?:boolean;resident?:import('./resident-buffers.ts').ResidentIdentity;sourceResource?:import('./binary-resource.ts').NativeBinaryImport;sourceImage?:number;persistent?:{version:1;id:string}}[];
 export?:{executable:string;output:string;image:number;fps:[number,number];codec:'h264_nvenc'|'hevc_nvenc'|'av1_nvenc'|'libx264'|'libx265'|'libaom-av1'|'png'|'exr';format:'nv12'|'rgba'|'gbrapf32le';display:boolean};
 mediaExport?:NativeMediaExport;
 inferences?:NativeInferenceDefinition[];
 /** Optional liveness allocation map, validated again by the native owner. */
 imageAllocations?:number[];
 /** Private verified resource lease, never an authored filesystem path. */
 imports?:{image:number;file:string;source?:'declared-resource'|'declared-video'|'hardware-video';stream?:string;video?:NativeVideoFrame}[];
 display:null|{image:number;shader:string;reach:number[];cusp:number[];profile:'aces2-sdr100-v1'|'linear709-sdr-v1'};
}
export interface NativeVideoFrame {frame:number;pts:number;width:number;height:number;tenBit:boolean;transfer:number;primaries:number;matrix:number[];referenceWhite:number;peakNits:number;hlgGamma:number}
/** Private frame-local delta; shaders/resources/immutable/state remain in the admitted program. */
export interface NativeStageCacheRef {pass:number;key:string;first?:number}
export interface NativeFrameBindings {version:1;imports?:NonNullable<NativeProgram['imports']>;data:{index:number;length:number;initial:number[]}[];passes:{header:number[];groups?:[number,number,number];count?:number}[]}
const previewCommands=['toggle','previous','next','first','last','previousSecond','nextSecond','previousMinute','nextMinute'] as const;
export type NativePreviewInput =
 | {input:number;action:typeof previewCommands[number]}
 | {input:number;action:'seek'|'scrubEnd';frame:number};
export interface NativePreviewPresented {frame:number;revision:number}
export interface NativePreviewAudioClock {revision:number;sample:number;ended:boolean}
export interface NativePreviewAudioPort {
 start(state:{revision:number;input:number;rate:number;start:number;end:number}):Promise<boolean>;
 queue(revision:number,start:number,frames:number,pcm:Uint8Array):Promise<boolean>;
 stop(revision:number):Promise<void>;
 listen(events:{clock(event:NativePreviewAudioClock):void;failed(revision:number,error:Error):void}):void;
}
export interface NativePreviewEvents {
 input(event:NativePreviewInput):void;
 presented(event:NativePreviewPresented):void;
}
export interface NativeFrameTicket {
 readonly publication?:number;
 readonly version:1;readonly frame:number;readonly slot:number;
 /** Submission acknowledgement is NOT GPU completion or physical scanout. */
 readonly completion:'submitted';readonly completed:Promise<void>;readonly gpuTimeMs?:number;
}
interface Deferred<T> {promise:Promise<T>;resolve:(v:T)=>void;reject:(e:unknown)=>void}
interface SlotWaiter {done:Deferred<number>;signal?:AbortSignal;cleanup:()=>void}
function deferred<T>():Deferred<T>{let resolve!:(v:T)=>void,reject!:(e:unknown)=>void;const promise=new Promise<T>((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
function freeze<T>(value:T):T {if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
const error=(code:string,message:string)=>new EngineError(code,message);

/** One process/device owner per Renderer. Program admitted ONCE; frames contain
 * bounded parameters only. The caller must supply already verified shader bytes.
 * Source/packages/models/URLs remain outside this service. Declared imports
 * may access only their explicit, private F32 resource lease. */
export class NativeGpuClient {
 private child:ChildProcessWithoutNullStreams;
 private nextId=0;private pending=new Map<number,Deferred<unknown>>();
 private completions=new Map<number,{frame:number;done:Deferred<void>;measurement?:{gpuTimeMs?:number}}>();
 private free:number[];private waiters:SlotWaiter[]=[];private buffer='';
 private fatal?:Error;private closing?:Promise<void>;private closed=false;
 private closeEvent=deferred<void>();
 private windowClosed=false;
 private previewEvents?:NativePreviewEvents;
 private readonly previewSession?:string;
 private previewAudioEvents?:Parameters<NativePreviewAudioPort['listen']>[0];
 private previewRollback?:{program:NativeProgram;residentKnown:Set<string>;tickets:WeakSet<object>;plans:Map<number,NativeProgram>};
 private cachedPrograms=new Map<number,NativeProgram>();
 private admitted:NativeProgram;get program(){return this.admitted;}readonly stderr:string[]=[];
 private batchQueue:Promise<unknown>=Promise.resolve();private queuedBatches=0;
 private completionTimers?:Map<number,ReturnType<typeof setTimeout>>;
 private tickets=new WeakSet<object>();
 private transportQueue:Promise<void>=Promise.resolve();
 private queuedWrites=0;private queuedBytes=0;
 private reserveQueue(bytes:number){if(!Number.isSafeInteger(bytes)||bytes<0||this.queuedBytes+bytes>this.transport.maxQueuedBytes)throw error("E_NATIVE_BACKPRESSURE","Queued native work exceeds configured maxQueuedBytes");this.queuedBytes+=bytes;let active=true;return()=>{if(active){active=false;this.queuedBytes-=bytes;}};}
 private transport:ReturnType<typeof nativeTransportLimits>&{maxQueuedBytes:number};
 private constructor(program:NativeProgram,executable:string,window:boolean,private timeoutMs:number,limits:NativeTransportLimits={}){
  this.previewSession=window?program.session:undefined;
  this.admitted=freeze(structuredClone(program));this.free=Array.from({length:program.slots},(_,i)=>i);
  this.transport={...nativeTransportLimits(program,limits),maxQueuedBytes:limits.maxQueuedBytes??program.maxBytes};
  this.child=spawn(executable,[...window?['--window']:[],'--control-bytes',String(this.transport.maxControlBytes),'--seed-bytes',String(this.transport.maxSeedBytes)],{stdio:'pipe',windowsHide:true,shell:false,env:nativeOwnerEnvironment()});
  this.child.stdout.setEncoding('utf8');this.child.stderr.setEncoding('utf8');
  this.child.stdin.on('error',()=>{});
  this.child.stderr.on('data',(s:string)=>{if(this.stderr.join('').length<16384)this.stderr.push(s);});
  this.child.stdout.on('data',(s:string)=>this.receive(s));
  this.child.on('error',e=>this.fail(error('E_NATIVE_PROCESS',e.message)));
  this.child.on('exit',(code,signal)=>{this.closed=true;if((!this.closing&&!this.windowClosed)||code!==0)this.fail(error('E_NATIVE_PROCESS',`Native process exited (${code??signal}): ${this.stderr.join('').slice(-2048)}`));else if(this.windowClosed)this.fail(error('E_NATIVE_CLOSED','Native preview window closed'));else if(this.closing){for(const p of this.pending.values())p.reject(error('E_NATIVE_CLOSED','Native owner exited during close'));this.pending.clear();}this.closeEvent.resolve();});
 }
 static async create(program:NativeProgram,options:{executable:string;window?:boolean;timeoutMs?:number;transport?:NativeTransportLimits}){
  if(![1,2].includes(program.version)||!Number.isSafeInteger(program.slots)||program.slots<1||program.slots>0xffffffff)throw error('E_NATIVE_PROTOCOL','Expected native protocol 1/2 and positive frame slots');
  assertNativeMetadata(program,program.maxBytes);if(program.slots*64>program.maxBytes)throw error("E_NATIVE_BUDGET","Frame slot metadata exceeds the configured byte budget");
    const client=new NativeGpuClient(program,options.executable,options.window===true,options.timeoutMs??30000,options.transport);
  try{const wire=binarySeedRequest('init',residentWireProgram(client.program,client.residentKnown),client.transport.maxSeedBytes);await client.request(wire.command,undefined,wire.payload);client.residentKnown=new Set(client.program.data?.flatMap(d=>d.resident?[d.resident.id]:[]));return client;}catch(e){client.child.kill();throw e;}
 }
 private receive(text:string){
  this.buffer+=text;
  if(Buffer.byteLength(this.buffer)>this.transport.maxControlBytes){this.fail(error('E_NATIVE_PROTOCOL','Native response exceeded bounded control channel'));return;}
  for(;;){
   const i=this.buffer.indexOf('\n');if(i<0)return;const line=this.buffer.slice(0,i);this.buffer=this.buffer.slice(i+1);
   let value:any;try{value=JSON.parse(line);}catch{this.fail(error('E_NATIVE_PROTOCOL','Invalid native JSON response'));return;}
   if(![1,2].includes(value.version)||this.program.version===2&&value.version!==2){this.fail(error('E_NATIVE_PROTOCOL','Unsupported native response version'));return;}
   if(value.event==='windowClosed'){this.windowClosed=true;continue;}
   if(value.event==='previewReloadFailed'&&this.previewRollback){
    const failure=error('E_NATIVE_PREVIEW_RELOAD',String(value.error));
    for(const [slot,completion] of this.completions){
     clearTimeout(this.completionTimers?.get(slot));
     this.completionTimers?.delete(slot);
     completion.done.reject(failure);
    }
    this.completions.clear();
    this.rejectWaiters(failure);
    continue;
   }
   if(value.event==='previewAudioClock'){
    const clock=value.clock;
    if(Number.isSafeInteger(clock?.revision)&&Number.isSafeInteger(clock?.sample)&&typeof clock.ended==='boolean')
     this.previewAudioEvents?.clock(clock);
    continue;
   }
   if(value.event==='previewAudioFailed'){
    this.previewAudioEvents?.failed(value.revision,error('E_PREVIEW_AUDIO_DEVICE',String(value.error)));
    continue;
   }
   if(value.event==='previewInput'){
    const {action,input,frame}=value;
    if(Number.isSafeInteger(input)&&input>0){
     if((action==='seek'||action==='scrubEnd')&&Number.isSafeInteger(frame)&&frame>=0)this.previewEvents?.input({action,input,frame});
     else if(previewCommands.includes(action))this.previewEvents?.input({action,input});
    }
    continue;
   }
   if(value.event==='previewPresented'){
    const {frame,revision}=value;
    if(Number.isSafeInteger(frame)&&frame>=0&&Number.isSafeInteger(revision)&&revision>=0)this.previewEvents?.presented({frame,revision});
    continue;
   }
   if(value.event==='completed'){
    const state=this.completions.get(value.slot);
    if(!state||state.frame!==value.frame){this.fail(error('E_NATIVE_PROTOCOL','Foreign or stale frame completion'));return;}
    clearTimeout(this.completionTimers?.get(value.slot));this.completionTimers?.delete(value.slot);
    if(state.measurement&&typeof value.gpuTimeMs==='number'&&Number.isFinite(value.gpuTimeMs)&&value.gpuTimeMs>0)
     state.measurement.gpuTimeMs=value.gpuTimeMs;
    this.completions.delete(value.slot);state.done.resolve();
    this.returnSlot(value.slot);
   }else if(value.event==='failed'){const message=String(value.error);this.fail(error(message.match(/^(E_(?:NATIVE|INFERENCE)_[A-Z_]+):/)?.[1]??'E_NATIVE_DEVICE',message));return;}
   else{
    if(value.id===0&&value.ok===false){this.fail(error(value.error?.code??'E_NATIVE_PROTOCOL',String(value.error?.message)));return;}
    const pending=this.pending.get(value.id);if(!pending){this.fail(error('E_NATIVE_PROTOCOL','Unknown request identity'));return;}
    this.pending.delete(value.id);
    if(value.ok===true)pending.resolve(value.result);
    else if(value.ok===false&&typeof value.error?.code==='string')pending.reject(error(value.error.code,String(value.error.message)));
    else{this.fail(error('E_NATIVE_PROTOCOL','Invalid response envelope'));return;}
   }
  }
 }
 private fail(e:Error){
  if(this.fatal)return;this.fatal=e;
  for(const p of this.pending.values())p.reject(e);this.pending.clear();
  for(const c of this.completions.values())c.done.reject(e);this.completions.clear();
  for(const timer of this.completionTimers?.values()??[])clearTimeout(timer);this.completionTimers?.clear();
  this.rejectWaiters(e);this.free=[];
  this.child.kill();
 }
 private watchCompletion(slot:number){if(!this.completions.has(slot))return;this.completionTimers??=new Map();this.completionTimers.set(slot,setTimeout(()=>this.fail(error('E_STAGE_TIMEOUT','Native GPU frame or encoder handoff exceeded the execution deadline')),this.timeoutMs));}
 private rejectWaiters(e:Error){for(const w of this.waiters){w.cleanup();w.done.reject(e);}this.waiters=[];}
 private waitForSlot(signal?:AbortSignal):Promise<number>{
  const done=deferred<number>(),waiter:SlotWaiter={done,signal,cleanup:()=>{}};
  const cancel=()=>{
   const index=this.waiters.indexOf(waiter);
   if(index<0)return;this.waiters.splice(index,1);waiter.cleanup();done.reject(error('E_RENDER_CANCELLED','Native frame cancelled while waiting for a slot'));
  };
  waiter.cleanup=()=>signal?.removeEventListener('abort',cancel);
  this.waiters.push(waiter);signal?.addEventListener('abort',cancel,{once:true});
  if(signal?.aborted)cancel();
  return done.promise;
 }
 private returnSlot(slot:number){
  if(this.fatal||this.closed)return;
  for(;;){
   const waiter=this.waiters.shift();if(!waiter){this.free.push(slot);return;}
   waiter.cleanup();
   if(waiter.signal?.aborted){waiter.done.reject(error('E_RENDER_CANCELLED','Native frame cancelled while waiting for a slot'));continue;}
   waiter.done.resolve(slot);return;
  }
 }
 private residentKnown=new Set<string>();
 private async request(command:Record<string,unknown>,signal?:AbortSignal,payload:readonly Iterable<Buffer>[]=[]):Promise<any>{
  if(this.fatal)throw this.fatal;if(this.closed)throw error('E_NATIVE_CLOSED','Native owner closed');
  const id=++this.nextId,d=deferred<unknown>();this.pending.set(id,d);void d.promise.catch(()=>{});
  const timer=setTimeout(()=>this.fail(error('E_NATIVE_TIMEOUT','Native control request timed out')),this.timeoutMs);
  const line=JSON.stringify({id,...command})+'\n';
  if(Buffer.byteLength(line)>this.transport.maxControlBytes){clearTimeout(timer);this.pending.delete(id);throw error('E_NATIVE_MESSAGE','Control request exceeds the configured transport budget');}
  try{
   // Last cancellation boundary is handing the command to the native pipe.
   // Once written, the command cannot safely be retracted.
   if(signal?.aborted)throw error('E_RENDER_CANCELLED','Native frame cancelled before transport submission');
   // Serialize header + body as one pipe write transaction. Stats/close/other
   // requests cannot be inserted between binary chunks. After the header is
   // handed over, cancellation must terminate the owner rather than omit bytes.
   const first=(this.queuedWrites??0)===0;this.queuedWrites=(this.queuedWrites??0)+1;
   const sendTransaction=async()=>{
    if(this.fatal)throw this.fatal;if(this.closed)throw error('E_NATIVE_CLOSED','Native owner closed');
    if(signal?.aborted)throw error('E_RENDER_CANCELLED','Native command cancelled before transport submission');
    const send=(chunk:string|Buffer)=>new Promise<void>((resolve,reject)=>this.child.stdin.write(chunk,e=>{if(e){const failure=error('E_NATIVE_PROCESS',e.message);this.fail(failure);reject(failure);}else resolve();}));
    await send(line);
    for(const body of payload)for(const chunk of body)await send(chunk);
   };
   const write=(first?sendTransaction():this.transportQueue.then(sendTransaction)).finally(()=>{this.queuedWrites--;});
   this.transportQueue=write.catch(()=>{});
   await write;return await d.promise;
  }finally{clearTimeout(timer);this.pending.delete(id);}
 }
 async submit(frame:number,parameters:readonly (readonly number[])[],options:{signal?:AbortSignal;frameBindings?:NativeFrameBindings;previewRevision?:number;previewAdvance?:boolean;previewTiming?:boolean;stageCache?:readonly NativeStageCacheRef[];previewCacheKey?:string;previewCacheOnly?:string}={}):Promise<NativeFrameTicket>{
  const signal=options.signal;
  if(signal!==undefined&&!(signal instanceof AbortSignal))throw error('E_NATIVE_PARAMETERS','Expected AbortSignal');
  if(options.previewRevision!==undefined&&(!Number.isSafeInteger(options.previewRevision)||options.previewRevision<0))
   throw error('E_NATIVE_PREVIEW','Preview revision must be a non-negative safe integer');
  if(signal?.aborted)throw error('E_RENDER_CANCELLED','Native frame cancelled before submission');
  if(this.closing||this.closed)throw error('E_NATIVE_CLOSED','Native owner closing');
  if(this.fatal)throw this.fatal;
  if(!Number.isSafeInteger(frame)||frame<0||parameters.length!==(options.previewCacheOnly?0:this.program.passes.length)||
   parameters.some((p,i)=>p.length!==this.program.kernels[this.program.passes[i].kernel].parameterWords||p.some(n=>!Number.isInteger(n)||n<0||n>0xffffffff)))
   throw error('E_NATIVE_PARAMETERS','Expected frame index and exact unsigned parameter words');

  const values=parameters.map(p=>Array.from(p)),bindings=options.frameBindings===undefined?undefined:structuredClone(options.frameBindings),available=this.free.shift();
  const release=available===undefined?this.reserveQueue(values.reduce((n,p)=>n+64+p.length*8,256)):undefined;let slot:number;try{slot=available??await this.waitForSlot(signal);}finally{release?.();}
  let done:Deferred<void>|undefined;
  try{
   if(this.fatal)throw this.fatal;
   if(this.closing||this.closed)throw error('E_NATIVE_CLOSED','Native owner closing');
   if(signal?.aborted)throw error('E_RENDER_CANCELLED','Native frame cancelled after slot acquisition');
   done=deferred<void>();void done.promise.catch(()=>{});
   const measurement=options.previewTiming?{} as {gpuTimeMs?:number}:undefined;
   this.completions.set(slot,{frame,done,measurement});
   const ack=await this.request(options.previewCacheOnly?{op:'submitCachedPreview',session:this.program.session,frame,slot,revision:options.previewRevision,key:options.previewCacheOnly}:
    {op:'submit',session:this.program.session,frame,slot,parameters:values,...bindings?{frameBindings:bindings}:{},...options.previewRevision===undefined?{}:{previewRevision:options.previewRevision},...options.previewAdvance?{previewAdvance:true}:{},...measurement?{previewTiming:true}:{},...options.stageCache?.length?{stageCache:options.stageCache}:{},...options.previewCacheKey?{previewCacheKey:options.previewCacheKey}:{}},signal);
   this.watchCompletion(slot);
   const ticket=Object.freeze({version:1 as const,frame,slot,completion:'submitted' as const,completed:done.promise,get gpuTimeMs(){return measurement?.gpuTimeMs;},...ack.publication===undefined?{}:{publication:ack.publication}});(this.tickets??=new WeakSet()).add(ticket);return ticket;
  }catch(e){
   if(!done||this.completions.has(slot)){this.completions.delete(slot);this.returnSlot(slot);done?.reject(e);}
   throw e;
  }
 }
 /** One bounded IPC batch, with a distinct resource slot and GPU submission for
  * every frame. Capacity is not a promise of simultaneous shader execution. */
 submitBatch(frames:readonly {frame:number;parameters:readonly (readonly number[])[];frameBindings?:NativeFrameBindings}[],options:{signal?:AbortSignal}={}):Promise<NativeFrameTicket[]>{
  let release:()=>void;try{release=this.reserveQueue(frames.reduce((n,f)=>n+f.parameters.reduce((v,p)=>v+64+p.length*8,256),256));frames=structuredClone(frames);}catch(error){release!?.();return Promise.reject(error);}this.queuedBatches=(this.queuedBatches??0)+1;
  const task=(this.batchQueue??Promise.resolve()).then(()=>this.submitBatchOwned(frames,options));this.batchQueue=task.catch(()=>{});return task.finally(()=>{this.queuedBatches--;release();});
 }
 private async submitBatchOwned(frames:readonly {frame:number;parameters:readonly (readonly number[])[];frameBindings?:NativeFrameBindings}[],options:{signal?:AbortSignal}={}):Promise<NativeFrameTicket[]>{
  if(!frames.length||frames.length>this.program.slots)throw error('E_NATIVE_BACKPRESSURE','Batch must fit the admitted native frame capacity');
  if(this.closing||this.closed)throw error('E_NATIVE_CLOSED','Native owner closing');if(this.fatal)throw this.fatal;
  if(options.signal?.aborted)throw error('E_RENDER_CANCELLED','Native batch cancelled before submission');
  if(frames.some(f=>!Number.isSafeInteger(f.frame)||f.frame<0||f.parameters.length!==this.program.passes.length||f.parameters.some((p,i)=>p.length!==this.program.kernels[this.program.passes[i].kernel].parameterWords||p.some(n=>!Number.isInteger(n)||n<0||n>0xffffffff))))throw error('E_NATIVE_PARAMETERS','Invalid batch frame or parameter layout');
  const snapshots=frames.map(f=>f.frameBindings===undefined?undefined:structuredClone(f.frameBindings));
  const acquired:number[]=[],tickets:NativeFrameTicket[]=[];
  try{
   for(const f of frames){const slot=this.free.shift()??await this.waitForSlot(options.signal);acquired.push(slot);
    if(options.signal?.aborted)throw error('E_RENDER_CANCELLED','Native batch cancelled while acquiring slots');
    const done=deferred<void>();void done.promise.catch(()=>{});this.completions.set(slot,{frame:f.frame,done});
    tickets.push({version:1,frame:f.frame,slot,completion:'submitted',completed:done.promise});
   }
   const ack=await this.request({op:'submitBatch',session:this.program.session,frames:frames.map((f,i)=>({frame:f.frame,slot:acquired[i],parameters:f.parameters.map(p=>Array.from(p)),...snapshots[i]?{frameBindings:snapshots[i]}:{}}))},options.signal);
   for(const [i,t] of tickets.entries()){if(ack.publications?.[i]!==undefined)Object.assign(t,{publication:ack.publications[i]});Object.freeze(t);(this.tickets??=new WeakSet()).add(t);}
   acquired.forEach(slot=>this.watchCompletion(slot));
   return tickets;
  }catch(e){for(const slot of acquired){const c=this.completions.get(slot);if(c){this.completions.delete(slot);c.done.reject(e);this.returnSlot(slot);}else if(!this.free.includes(slot))this.returnSlot(slot);}throw e;}
 }
 async reconfigure(program:NativeProgram,cacheId?:number){
  if(this.closing||this.closed)throw error('E_NATIVE_CLOSED','Native owner closing');if(this.waiters.length||this.queuedBatches)throw error('E_NATIVE_BUSY','Finish queued submissions before changing native layout');
  await Promise.all([...this.completions.values()].map(c=>c.done.promise));if(program.session!==this.program.session)throw error('E_NATIVE_SESSION','Plan update cannot replace its owner');
  const snapshot=freeze(structuredClone(program));
  try{
   const wire=binarySeedRequest('reconfigure',residentWireProgram(snapshot,this.residentKnown),this.transport.maxSeedBytes);
   await this.request(cacheId===undefined?wire.command:{...wire.command,cacheId},undefined,wire.payload);
   this.admitted=snapshot;
   this.residentKnown=new Set(snapshot.data?.flatMap(d=>d.resident?[d.resident.id]:[]));
   this.free=Array.from({length:program.slots},(_,i)=>i);
   if(cacheId===undefined)this.cachedPrograms.clear();
   else{
    this.cachedPrograms.set(cacheId,snapshot);
    if(this.cachedPrograms.size>8)this.cachedPrograms.delete(this.cachedPrograms.keys().next().value!);
   }
  }catch(e){if(!this.previewRollback)this.fail(e as Error);throw e;}
 }
 async activatePlan(cacheId:number):Promise<boolean>{
  const snapshot=this.cachedPrograms.get(cacheId);
  if(!snapshot||snapshot.session!==this.program.session)return false;
  if(this.closing||this.closed)throw error('E_NATIVE_CLOSED','Native owner closing');
  if(this.waiters.length||this.queuedBatches)throw error('E_NATIVE_BUSY','Finish queued submissions before activating a plan');
  await Promise.all([...this.completions.values()].map(c=>c.done.promise));
  const result=await this.request({op:'activatePlan',session:this.program.session,cacheId});
  this.cachedPrograms.delete(cacheId);
  if(result.hit!==true)return false;
  this.cachedPrograms.set(cacheId,snapshot);
  this.admitted=snapshot;
  this.residentKnown=new Set();
  this.free=Array.from({length:snapshot.slots},(_,i)=>i);
  return true;
 }
 async stateCheckpoint(action:'save'|'save-preview'|'save-continuation'|'restore'|'release',name:string){if(this.waiters.length||this.queuedBatches)throw error('E_NATIVE_BUSY','Complete queued submissions before GPU state checkpoint operations');await Promise.all([...this.completions.values()].map(c=>c.done.promise));return this.request({op:'stateCheckpoint',session:this.program.session,action,name});}
 stats(){return this.request({op:'stats',session:this.program.session});}
 async inferenceCapabilities(options:{signal?:AbortSignal}={}):Promise<import('../inference/types.ts').InferenceCapabilities>{return this.request({op:'inferenceCapabilities',session:this.program.session},options.signal);}
 async exportBuffer(ticket:NativeFrameTicket,id:string,file:string){
  if(!this.tickets?.has(ticket)||!Number.isSafeInteger(ticket.publication))throw error('E_NATIVE_DATA_TICKET','A native frame ticket from this owner is required');
  await ticket.completed;return this.request({op:'readData',session:this.program.session,frame:ticket.frame,slot:ticket.slot,publication:ticket.publication,name:id,file});
 }
 async preparePreviewReload(program:NativeProgram){
  if(this.previewRollback||this.waiters.length||this.completions.size||this.queuedBatches)
   throw error('E_NATIVE_BUSY','Finish preview work before replacing the native owner');
  assertNativeMetadata(program,program.maxBytes);
  const snapshot=freeze(structuredClone(program));
  await this.request({op:'preparePreviewReload',session:this.program.session,program:snapshot});
  this.previewRollback={program:this.program,residentKnown:this.residentKnown,tickets:this.tickets,plans:this.cachedPrograms};
  this.cachedPrograms=new Map();
  this.admitted=snapshot;
  this.residentKnown=new Set();
  this.tickets=new WeakSet();
  this.free=Array.from({length:snapshot.slots},(_,i)=>i);
 }
 async commitPreviewReload(state:{frame:number;revision:number;input:number;duration:number;retainPreview?:import('./preview-segments.ts').PreviewRegion[]}){
  if(!this.previewRollback)throw error('E_NATIVE_PREVIEW_RELOAD','No pending preview replacement');
  await this.request({op:'commitPreviewReload',session:this.program.session,...state});
  this.previewRollback=undefined;
 }
 async abortPreviewReload(){
  const old=this.previewRollback;
  if(!old)return;
  try{
   await this.request({op:'abortPreviewReload',session:this.program.session});
   this.admitted=old.program;
   this.residentKnown=old.residentKnown;
   this.tickets=old.tickets;
   this.cachedPrograms=old.plans;
   this.free=Array.from({length:old.program.slots},(_,i)=>i);
  }catch(e){
   this.fail(e as Error);
   await this.exited;
   throw e;
  }finally{this.previewRollback=undefined;}
 }
 previewAudioPort():NativePreviewAudioPort{
  const session=this.previewSession;
  if(!session)throw error('E_NATIVE_PREVIEW','Audio output requires a native preview window');
  return {
   start:async state=>(await this.request({op:'previewAudioStart',session,...state})).accepted===true,
   queue:async(revision,start,frames,pcm)=>(await this.request({op:'previewAudioQueue',session,revision,start,frames},undefined,
    [[Buffer.from(pcm.buffer,pcm.byteOffset,pcm.byteLength)]])).accepted===true,
   stop:async revision=>{await this.request({op:'previewAudioStop',session,revision});},
   listen:events=>{this.previewAudioEvents=events;},
  };
 }
 setPreviewEvents(events:NativePreviewEvents){this.previewEvents=events;}
 async updatePreviewState(state:{revision:number;input:number;duration:number;label:string;active:boolean}):Promise<boolean>{
  if(!this.previewSession)throw error('E_NATIVE_PREVIEW','No native preview window');
  const result=await this.request({op:'previewState',session:this.previewSession,...state});
  return result.accepted===true;
 }
 connected(){return !this.closed&&!this.fatal&&!this.closing;}
 get exited(){return this.closeEvent.promise;}
 /** Fails in production builds. Development readback is explicit and idle-only. */
 inspectForTest(slot:number,image:number){return this.request({op:'inspect',session:this.program.session,slot,image}) as Promise<{pixels:number[]}>;}
 inspectDisplayForTest(slot:number){return this.request({op:'inspectDisplay',session:this.program.session,slot}) as Promise<{pixels:number[]}>;}
 inspectMediaForTest(slot:number){return this.request({op:'inspectMedia',session:this.program.session,slot}) as Promise<{pixels:number[]}>;}
 close():Promise<void>{
  if(this.closing)return this.closing;
  this.closing=(async()=>{
   this.rejectWaiters(error('E_NATIVE_CLOSED','Native owner closing'));
   try{if(!this.closed&&!this.fatal)await this.request({op:'close',session:this.program.session});}
   catch(e){if(!this.closed||this.fatal||!(e instanceof EngineError)||e.code!=='E_NATIVE_CLOSED')throw e;}
   finally{this.child.stdin.end();const timer=setTimeout(()=>this.child.kill(),2000);await this.closeEvent.promise;clearTimeout(timer);}
  })();return this.closing;
 }
}
