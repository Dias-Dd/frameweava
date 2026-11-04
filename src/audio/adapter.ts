import {Worker,MessageChannel,type MessagePort} from 'node:worker_threads';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {EngineError} from '../core/errors.ts';
import type {BuiltProject,StageSpec,FrameContext,PortValue} from '../core/types.ts';
import {assertAudioMetadata,type AudioStageMetadata,type IntervalRequest,type IntervalResult} from './contract.ts';
import {assertAudioBlock,isAudioDescriptor,plain,type AudioBlockV1} from './block.ts';
import type {PerformanceSink} from '../render/performance.ts';
import {AudioResourceReader} from './resources.ts';
import type {AudioResourceOptions} from './resource-options.ts';

type Message={ready?:boolean;started?:boolean;ok?:boolean;outputs?:Record<string,PortValue|AudioBlockV1>;error?:{code:string;message:string;details?:unknown}};
type Entry={worker:Worker;port:MessagePort;metadata:AudioStageMetadata;closed:boolean;pending?:{resolve:(m:Message)=>void;reject:(e:unknown)=>void};exit:Promise<void>};
/** CPU Stage boundary only. Scheduling, cache, trust and lifecycle ownership stay in Renderer. */
export class AudioAdapter {
  readonly engine='audio';private entries=new Map<string,Entry>();private disposed=false;private closing?:Promise<void>;
  readonly intervalCapability={schemaVersion:1 as const,unit:'samples' as const,seek:'stateless' as const,lookbehindSamples:0,lookaheadSamples:0,latencySamples:0,tailSamples:0};
  private resources:AudioResourceReader;
  constructor(private build:BuiltProject,private timeoutMs=20000,private onProfile?:PerformanceSink,resourceOptions:AudioResourceOptions={}){this.resources=new AudioResourceReader(build,resourceOptions);}
  resourceStats(){return this.resources.stats();}
  async init(stage:StageSpec&{audio?:AudioStageMetadata}){
    if(this.disposed||this.entries.has(stage.id))throw new EngineError('E_AUDIO_WORKER_CLOSED','Audio Adapter is closed or Stage already initialized',{stageId:stage.id});
    assertAudioMetadata(stage.audio);if(!stage.entry||!this.build.stageBundles[stage.id])throw new EngineError('E_AUDIO_FACTORY','Audio Stage requires a compiled explicit module',{stageId:stage.id});
    const code=await readFile(join(this.build.dir,this.build.stageBundles[stage.id]),'utf8');if(this.disposed)throw new EngineError('E_AUDIO_WORKER_CLOSED','Audio Adapter closed during initialization',{stageId:stage.id});
    const channel=new MessageChannel(),wake=new Int32Array(new SharedArrayBuffer(4));
    const worker=new Worker(new URL('./worker.mjs',import.meta.url),{workerData:{code,exportName:stage.exportName??'default',timeoutMs:this.timeoutMs,resourcePort:channel.port2,resourceWake:wake.buffer,resourceIds:this.build.manifest.resources.map(r=>r.id),init:{sampleRate:stage.audio.sampleRate,layout:stage.audio.layout,durationSamples:stage.audio.durationSamples,seed:this.build.manifest.composition.seed}},transferList:[channel.port2],resourceLimits:{maxOldGenerationSizeMb:128,maxYoungGenerationSizeMb:32},execArgv:[]});
    const entry:Entry={worker,port:channel.port1,metadata:stage.audio,closed:false,exit:new Promise<void>(r=>worker.once('exit',()=>r()))};this.entries.set(stage.id,entry);
    channel.port1.on('message',async request=>{
      let response:unknown;
      try{if(entry.closed||!entry.pending)throw new EngineError('E_AUDIO_WORKER_CLOSED','Audio resource request has no active Stage call');
        const value=request.op==='read'?await this.resources.read(request.arg):request.op==='info'?await this.resources.info(request.arg.resourceId,request.arg.stream):request.op==='bytes'?await this.resources.bytes(request.arg):undefined;
        if(value===undefined)throw new EngineError('E_AUDIO_RESOURCE','Unknown audio resource operation');response={id:request.id,ok:true,value};
      }catch(e){const error=e instanceof EngineError?e:new EngineError('E_AUDIO_RESOURCE','Audio resource request failed');response={id:request.id,ok:false,error:{code:error.code,message:error.message,details:error.details}};}
      if(!entry.closed){channel.port1.postMessage(response);Atomics.add(wake,0,1);Atomics.notify(wake,0);}
    });
    worker.on('message',(m:Message)=>{if(m.ready)return;if(m.started){try{this.onProfile?.({phase:'audio.started',durationMs:0,outcome:'ok',stageId:stage.id});}catch{}return;}const pending=entry.pending;entry.pending=undefined;pending?.resolve(m);});
    worker.on('error',e=>{entry.closed=true;entry.port.close();void this.resources.close().catch(()=>{});entry.pending?.reject(new EngineError('E_AUDIO_WORKER_CLOSED',e.message,{stageId:stage.id}));entry.pending=undefined;});
    worker.on('exit',()=>{entry.closed=true;entry.port.close();entry.pending?.reject(new EngineError('E_AUDIO_WORKER_CLOSED','Audio worker closed during execution',{stageId:stage.id}));entry.pending=undefined;});
  }
  private async call(stage:StageSpec,mode:'interval'|'frame',request:IntervalRequest|FrameContext,inputs:Record<string,PortValue|AudioBlockV1>,props:Record<string,unknown>):Promise<IntervalResult>{
    const entry=this.entries.get(stage.id);if(this.disposed||!entry||entry.closed)throw new EngineError('E_AUDIO_WORKER_CLOSED','Audio Stage is not available',{stageId:stage.id});if(entry.pending)throw new EngineError('E_AUDIO_BUSY','Renderer must serialize requests for the same Audio Stage',{stageId:stage.id});
    let timer:ReturnType<typeof setTimeout>|undefined;
    try{
      const message=await new Promise<Message>((resolve,reject)=>{
        entry.pending={resolve,reject};timer=setTimeout(()=>{entry.closed=true;entry.pending=undefined;entry.port.close();void this.resources.close().catch(()=>{});void entry.worker.terminate().catch(()=>{});reject(new EngineError('E_STAGE_TIMEOUT','Audio Stage exceeded its bounded execution time',{stageId:stage.id}));},this.timeoutMs);
        entry.worker.postMessage({mode,request,inputs,props});
      });
      if(!message.ok||!message.outputs||!plain(message.outputs))throw new EngineError(message.error?.code??'E_AUDIO_OUTPUT',message.error?.message??'Audio Stage returned malformed outputs',{stageId:stage.id,details:message.error?.details});
      const coverage:IntervalResult['coverage']={};
      for(const [name,value]of Object.entries(message.outputs))if(stage.outputs[name]==='audio'||isAudioDescriptor(value)){assertAudioBlock(value);coverage[name]={unit:'samples',sampleRate:value.sampleRate,start:value.startSample+value.validRange.start,endExclusive:value.startSample+value.validRange.endExclusive};}
      return {outputs:message.outputs,coverage,diagnostics:[]};
    }finally{clearTimeout(timer);entry.pending=undefined;}
  }
  evaluateInterval(stage:StageSpec,request:IntervalRequest,inputs:Record<string,PortValue|AudioBlockV1>,props:Record<string,unknown>){return this.call(stage,'interval',request,inputs,props);}
  async renderAt(stage:StageSpec,context:FrameContext,inputs:Record<string,PortValue|AudioBlockV1>,props:Record<string,unknown>){const {outputs,diagnostics}=await this.call(stage,'frame',context,inputs,props);return {outputs,diagnostics};}
  dispose():Promise<void>{if(this.closing)return this.closing;this.disposed=true;this.closing=(async()=>{await Promise.all([this.resources.close(),...Array.from(this.entries.values(),async e=>{e.closed=true;e.port.close();await e.worker.terminate();await e.exit;})]);this.entries.clear();})();return this.closing;}
}
