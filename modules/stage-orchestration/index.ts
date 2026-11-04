import {AsyncLocalStorage} from 'node:async_hooks';
import sharp from 'sharp';
import {EngineError,diagnostic} from '../../src/core/errors.ts';
import type {BuiltProject,Diagnostic,FrameContext,Json,PortValue,StageFrameResult,StageSpec} from '../../src/core/types.ts';
import {assertStageInputs,inputValueMatches} from '../../src/core/ports.ts';
import {evaluate} from '../../src/core/animation.ts';
import {frameContext,isActive,secondsToFrame} from '../../src/core/time.ts';
import {captureFrameExecution,frameStageProps} from '../../src/render/frame-execution.ts';
import {isProfessionalSurface,pixelsFromSurface} from '../../src/media/surface.ts';
import {CONFIG,RUNTIME,definition,runtime} from '../../src/shared-state/protocol.ts';
import type {SharedSessionAdapter} from '../shared-state/session-adapter.ts';
import type {SharedCommit} from '../shared-state/coordinator.ts';

import {stageRef,type Ports,type StageRef,type CallOptions,type RunOptions,type RunResult} from './types.ts';
export {stageRef,type Ports,type StageRef,type RunOptions,type RunResult} from './types.ts';

/** INTERNAL integration contract. The existing Session owns this scope/queue/seal;
 * the Renderer owns invoke and instances. This component owns none of them. */
export interface CallScope {
  build:BuiltProject;shared:SharedSessionAdapter;
  assertActive():void;validateSeal():Promise<void>;
  invoke(stage:StageSpec,context:FrameContext,inputs:Ports,props:Record<string,unknown>):Promise<StageFrameResult>;
  /** Must invalidate only the called Stage's DAG cache identity, even on throw. */
  markExecuted(stageId:string):void;
}
export interface CallHost {readonly id:string;nextCallId():string;enqueueCall<T>(run:(scope:CallScope)=>Promise<T>,signal?:AbortSignal):Promise<T>}
const running=new AsyncLocalStorage<readonly CallHost[]>();
/** INTERNAL: the owner must wrap automatic DAG operations too, not only run(). */
export function withExecutionOwner<T>(host:CallHost,run:()=>T):T{const parents=running.getStore()??[];return running.run(parents.includes(host)?parents:[...parents,host],run);}
export function isExecutionOwner(host:CallHost):boolean{return running.getStore()?.includes(host)??false;}
const fail=(code:string,message:string,stageId?:string):never=>{throw new EngineError(code,message,{stageId});};

async function validateOutputs(stage:StageSpec,result:StageFrameResult){
  if(!result||!result.outputs||typeof result.outputs!=='object'||!Array.isArray(result.diagnostics))fail('E_OUTPUT_FORMAT','Invalid Stage result',stage.id);
  for(const name of Object.keys(result.outputs))if(!Object.hasOwn(stage.outputs,name))fail('E_OUTPUT_UNDECLARED',`Undeclared output ${name}`,stage.id);
  for(const [name,type]of Object.entries(stage.outputs))if(!Object.hasOwn(result.outputs,name)||!inputValueMatches(type,result.outputs[name]))fail('E_OUTPUT_TYPE',`Output ${name} must be ${type}`,stage.id);
  if(result.diagnostics.length>256||result.diagnostics.some(d=>!d||!['error','warning'].includes(d.severity)||typeof d.code!=='string'||typeof d.message!=='string'||d.message.length>8192))fail('E_OUTPUT_FORMAT','Invalid or oversized diagnostics',stage.id);
  if(result.diagnostics.some(d=>d.severity==='error'))fail('E_STAGE_CALL_DIAGNOSTIC','Stage returned an error diagnostic',stage.id);
  await validatePayloads(result.outputs,stage.id);
}
async function validatePayloads(values:Ports,stageId:string){
  for(const value of Object.values(values)){
    if(isProfessionalSurface(value))pixelsFromSurface(value);
    else if(value&&typeof value==='object'&&!Array.isArray(value)&&'kind'in value&&value.kind==='surface'&&'dataUrl'in value){
      const s=value as import('../../src/core/types.ts').Surface;let meta:Awaited<ReturnType<ReturnType<typeof sharp>['metadata']>>;
      try{meta=await sharp(Buffer.from(s.dataUrl.split(',')[1],'base64')).metadata();}catch(error){throw new EngineError('E_STAGE_CALL_PAYLOAD','PNG bytes could not be decoded',{stageId,details:{cause:diagnostic(error)}});}
      if(meta.format!=='png'||meta.width!==s.width||meta.height!==s.height)fail('E_OUTPUT_SIZE','Surface bytes and descriptor disagree',stageId);
    }
  }
  // Same bounded JSON transport for explicit call inputs/outputs. SO-1: 4 MiB.
  captureFrameExecution({stageProps:{[stageId]:values as unknown as Record<string,Json>}},[stageId]);
}

/** No registry, browser, result cache, graph scheduler, or independent Session. */
export class StageCaller {
  constructor(private readonly host:CallHost){}
  run<I extends Ports,O extends Ports>(stage:StageRef<I,O>,options:RunOptions<I>):Promise<RunResult<O>>;
  run(stage:string,options?:RunOptions):Promise<RunResult>;
  run(stage:string|StageRef<any,any>,options:CallOptions={}):Promise<RunResult>{
    if(running.getStore()?.includes(this.host))return Promise.reject(new EngineError('E_STAGE_CALL_REENTRANT','SO-1 does not re-enter the owning Session queue; use a future explicit child scope'));
    let id:string,inputs:Ports;
    try{
      if(typeof stage!=='string'&&(!stage||stage.kind!=='frameweave.stage-ref'||Object.keys(stage).some(k=>!['kind','id'].includes(k))))fail('E_STAGE_REFERENCE','Expected a project Stage ID or StageRef');
      id=typeof stage==='string'?stage:stage.id;stageRef(id);
      if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(k=>!['inputs','frame','time','signal','cache'].includes(k)))fail('E_STAGE_CALL_OPTIONS','Unknown call option',id);
      if(options.cache!==undefined&&options.cache!=='none')fail('E_STAGE_CALL_CACHE','SO-1 explicit calls do not cache results; pure memoization is not yet implemented',id);
      if(options.signal!==undefined&&!(options.signal instanceof AbortSignal))fail('E_ARGUMENT','signal must be AbortSignal',id);
      for(const key of ['frame','time']as const)if(options[key]!==undefined&&(typeof options[key]!=='number'||!Number.isFinite(options[key])||options[key]!<0||key==='frame'&&!Number.isSafeInteger(options[key])))fail('E_TIME_POSITION','Invalid call frame/time',id);
      const captured=captureFrameExecution({stageProps:{[id]:(options.inputs??{}) as unknown as Record<string,Json>}},[id])!;
      // Validation uses JSON budgets; transport uses clone semantics (including -0).
      inputs=structuredClone(options.inputs??{});
    }catch(e){return Promise.reject(e);}
    const request={frame:options.frame,time:options.time},signal=options.signal,callId=this.host.nextCallId();
    return this.host.enqueueCall(scope=>withExecutionOwner(this.host,async()=>{
      scope.assertActive();await scope.validateSeal();
      const build=scope.build,stage=build.manifest.stages.find(s=>s.id===id);if(!stage)fail('E_STAGE_REFERENCE',`Unknown Stage ${id}`,id);
      const fromTime=request.time===undefined?undefined:secondsToFrame(request.time,build.manifest.composition.fps),frame=request.frame??fromTime??0;
      if(request.frame!==undefined&&fromTime!==undefined&&request.frame!==fromTime)fail('E_TIME_POSITION','frame and time disagree',id);
      if(frame<0||frame>=build.manifest.composition.durationInFrames)fail('E_FRAME_RANGE','Call frame outside composition',id);
      if(!isActive(stage!,frame))fail('E_STAGE_INACTIVE','Stage inactive at call time',id);
      if(stage!.engine==='audio'||Object.values(stage!.outputs).includes('audio'))fail('E_STAGE_CALL_INTERVAL','Use evaluateInterval for Audio Stages; SO-1 calls have frame semantics',id);
      const context=frameContext(build.manifest,stage!,frame);
      const result=await scope.shared.call(id,frame,async execution=>{
        const props=frameStageProps(evaluate(stage!.props,context) as Record<string,unknown>,id,execution),inputTypes={...stage!.inputTypes};
        if(Object.hasOwn(props,CONFIG)){
          const d=definition(props[CONFIG]),r=runtime(props[RUNTIME],context);if(r.callStage!==id)fail('E_SHARED_CALL_SCOPE','Expected a host call snapshot',id);
          for(const b of d.reads){if(Object.hasOwn(inputs,b.input))fail('E_SHARED_ACCESS','Caller cannot override managed input bindings',id);delete inputTypes[b.input];}
        }
        const view={...stage!,inputTypes,inputs:inputs as Record<string,Json>};assertStageInputs(view,inputs,{frame});
        const copied=structuredClone(inputs);await validatePayloads(copied,id);let output:StageFrameResult;
        try{const returned=await scope.invoke(view,context,copied,props);if(!returned||typeof returned!=='object'||!returned.outputs)fail('E_OUTPUT_FORMAT','Invalid Stage result',id);
          const snapshot=captureFrameExecution({stageProps:{[id]:returned.outputs as unknown as Record<string,Json>}},[id])!;
          try{output={outputs:structuredClone(returned.outputs),diagnostics:structuredClone(returned.diagnostics)};}catch(error){throw new EngineError('E_OUTPUT_FORMAT','Stage result is not a transferable value',{stageId:id,frame,details:{cause:diagnostic(error)}});}
        }finally{scope.markExecuted(id);}
        await validateOutputs(view,output);scope.assertActive();await scope.validateSeal();scope.assertActive();
        return {stageOutputs:{[id]:structuredClone(output.outputs)},diagnostics:structuredClone(output.diagnostics)};
      },{assertActive:()=>scope.assertActive()});
      return {callId,stageId:id,context:structuredClone(context),outputs:result.stageOutputs[id],diagnostics:result.diagnostics,cacheHit:false as const,...(result.shared?{shared:result.shared}:{})};
    }),signal);
  }
}
