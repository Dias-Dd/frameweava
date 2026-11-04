import {EngineError} from '../../src/core/errors.ts';
import type {NativeRecordingScope} from '../native-gpu/scope.ts';
import type {TemporalExchange} from '../native-gpu/temporal-exchange.ts';
import type {NativeStageCalls,NativeStageCallResult,NativeStagePorts} from './composite-types.ts';

/** Lives inside the existing isolated Stage realm, sharing its continuation. */
export class CompositeController {
 private open=false;private pending?:Promise<NativeStageCallResult>;private failed?:unknown;private closed=false;
 readonly api:NativeStageCalls;
 constructor(private scope:NativeRecordingScope,private exchange:TemporalExchange){
  this.api=Object.freeze({version:1,run:(stage:Parameters<NativeStageCalls['run']>[0],options?:{inputs?:NativeStagePorts})=>this.run(stage,options)}) as NativeStageCalls;
 }
 begin(){if(this.closed||this.open)throw new EngineError('E_STAGE_CALL_SCOPE','Composite scope is unavailable');this.open=true;this.failed=undefined;}
 private run(stage:Parameters<NativeStageCalls['run']>[0],options:{inputs?:NativeStagePorts}={}){
  const work=(async()=>{
   if(!this.open||this.closed)throw new EngineError('E_STAGE_CALL_SCOPE','Child calls require an active composite renderAt');
   if(this.failed)throw this.failed;
   if(this.pending)throw new EngineError('E_STAGE_CALL_BUSY','Child calls must be awaited in order');
   const id=typeof stage==='string'?stage:stage?.kind==='frameweave.stage-ref'&&Object.keys(stage).every(k=>k==='kind'||k==='id')?stage.id:undefined;
   if(typeof id!=='string'||!id||!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(k=>k!=='inputs'))throw new EngineError('E_STAGE_CALL_OPTIONS','Expected a local Stage ID and {inputs?}');
   const inputs=this.scope.encodePorts(options.inputs??{}),packet=this.scope.takePacket();
   const reply=await this.exchange.stage(id,inputs,packet);if(reply.error)throw new EngineError(reply.error.code,reply.error.message);
   const result=reply.result;if(!result||result.version!==1||result.stageId!==id||result.cacheHit!==false)throw new EngineError('E_STAGE_CALL_PROTOCOL','Invalid child call result');
   return {...result,outputs:this.scope.decodePorts(result.outputs)} as NativeStageCallResult;
  })();
  // A rejected child fails this composite, even if author code catches it. Already
  // completed GPU state segments remain governed by their existing commit rules.
  if(!this.pending){this.pending=work;void work.then(()=>{if(this.pending===work)this.pending=undefined;},error=>{this.failed??=error;if(this.pending===work)this.pending=undefined;});}
  else void work.catch(error=>{this.failed??=error;});
  return work;
 }
 async finish(){if(this.pending){this.open=false;await this.pending.catch(()=>{});throw new EngineError('E_STAGE_CALL_PENDING','Await every child call before returning');}this.open=false;if(this.failed)throw this.failed;}
 abort(){this.open=false;}
 dispose(){this.closed=true;this.open=false;}
}
