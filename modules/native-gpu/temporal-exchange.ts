import type {NativePortPacket} from '../stage-orchestration/composite-types.ts';
import {EngineError} from '../../src/core/errors.ts';
import type {FrameContext} from '../../src/core/types.ts';
import type {GpuPixelImageInfo} from '../gpu-effects/pixel-types.ts';
export interface TemporalInputRequest {version:1;kind:'native-temporal-request';id:number;continuation:string;input:string;clock:'consumer-local'|'composition';context:Readonly<FrameContext>}
export interface StateSegmentRequest {version:1;kind:'native-state-segment';id:number;continuation:string;packet:import('./state-segments.ts').NativeStatePacket}
export interface StageCallRequest {version:1;kind:'native-stage-call';id:number;continuation:string;stageId:string;inputs:NativePortPacket;packet:import('./state-segments.ts').NativeStatePacket}
export type NativeContinuationRequest=TemporalInputRequest|StateSegmentRequest|StageCallRequest;
export interface TemporalInputReply {version:1;id:number;continuation:string;nextContinuation:string;image?:number;info?:GpuPixelImageInfo;result?:{version:1;callId:string;stageId:string;context:FrameContext;outputs:NativePortPacket;cacheHit:false};error?:{code:string;message:string}}
/** One bounded response per existing RPC. Suspends the recorder, not the GPU or
 * canonical Stage; no reverse pipe, filesystem, clock or global service is installed. */
export class TemporalExchange {
 private aborting=false;private token='';private serial=0;private pending?:{request:NativeContinuationRequest;resolve:(r:TemporalInputReply)=>void;reject:(e:unknown)=>void};
 private announce?:(r:NativeContinuationRequest)=>void;private task?:Promise<unknown>;
 async request(input:string,clock:'consumer-local'|'composition',context:Readonly<FrameContext>){
  if(this.aborting)throw new EngineError('E_NATIVE_TEMPORAL_CLOSED','Temporal recording is aborting');if(!/^[a-f0-9]{64}$/.test(this.token))throw new EngineError('E_NATIVE_TEMPORAL_PROTOCOL','Core continuation required');if(this.pending||!this.task)throw new EngineError('E_NATIVE_TEMPORAL_BUSY','One ordered source request requires an active recording');
  return new Promise<TemporalInputReply>((resolve,reject)=>{const request:TemporalInputRequest={version:1,kind:'native-temporal-request',id:++this.serial,continuation:this.token,input,clock,context};this.pending={request,resolve,reject};this.announce?.(request);});
 }
 async segment(packet:import('./state-segments.ts').NativeStatePacket){
  if(this.aborting||!this.task||this.pending||!/^[a-f0-9]{64}$/.test(this.token))throw new EngineError('E_NATIVE_SEGMENT_BUSY','One active Core continuation is required');
  const reply=await new Promise<TemporalInputReply>((resolve,reject)=>{const request:StateSegmentRequest={version:1,kind:'native-state-segment',id:++this.serial,continuation:this.token,packet};this.pending={request,resolve,reject};this.announce?.(request);});
  if(reply.error)throw new EngineError(reply.error.code,reply.error.message);
 }
 async stage(stageId:string,inputs:NativePortPacket,packet:import('./state-segments.ts').NativeStatePacket){
  if(this.aborting||!this.task||this.pending||!/^[a-f0-9]{64}$/.test(this.token))throw new EngineError('E_STAGE_CALL_SCOPE','One active Core continuation is required');
  return new Promise<TemporalInputReply>((resolve,reject)=>{const request:StageCallRequest={version:1,kind:'native-stage-call',id:++this.serial,continuation:this.token,stageId,inputs,packet};this.pending={request,resolve,reject};this.announce?.(request);});
 }
 start(run:()=>Promise<unknown>,token?:string){if(this.task)throw new EngineError('E_STAGE_BUSY','Temporal recording already running');this.token=token??'';this.task=Promise.resolve().then(run);return this.turn();}
 resume(reply:TemporalInputReply){const p=this.pending;if(!p||!reply||reply.version!==1||reply.id!==p.request.id||reply.continuation!==this.token||!/^[a-f0-9]{64}$/.test(reply.nextContinuation)||reply.nextContinuation===this.token)throw new EngineError('E_NATIVE_TEMPORAL_EPOCH','Foreign or stale source reply');this.pending=undefined;this.token=reply.nextContinuation;p.resolve(reply);return this.turn();}
 private async turn(){if(!this.task)throw new EngineError('E_NATIVE_TEMPORAL_EPOCH','No suspended recording');let wake!:(r:NativeContinuationRequest)=>void;const event=new Promise<NativeContinuationRequest>(r=>{wake=r;});this.announce=wake;if(this.pending)wake(this.pending.request);
  try{return await Promise.race([this.task.then(value=>({done:true as const,value})),event.then(value=>({done:false as const,value}))]).then(r=>{if(r.done){this.task=undefined;return r.value;}return r.value;});}catch(e){this.task=undefined;throw e;}finally{this.announce=undefined;}}
 async cancel(token:string,error:unknown){if(!this.task||token!==this.token)throw new EngineError('E_NATIVE_TEMPORAL_EPOCH','Foreign cancellation');return this.abort(error);}
 async abort(error:unknown){this.aborting=true;this.pending?.reject(error);this.pending=undefined;await this.task?.catch(()=>{});this.task=undefined;this.aborting=false;}
 get active(){return !!this.task;}
}
