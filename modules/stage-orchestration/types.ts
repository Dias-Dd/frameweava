import {EngineError} from '../../src/core/errors.ts';
import type {Diagnostic,FrameContext,PortValue} from '../../src/core/types.ts';
import type {SharedCommit} from '../shared-state/coordinator.ts';
export type Ports=Record<string,PortValue>;
export interface StageRef<I extends Ports=Ports,O extends Ports=Ports>{readonly kind:'frameweave.stage-ref';readonly id:string;readonly __types?:(input:I)=>O}
export function stageRef<I extends Ports=Ports,O extends Ports=Ports>(id:string):StageRef<I,O>{
  if(typeof id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(id))throw new EngineError('E_STAGE_REFERENCE','Invalid Stage identity');
  return Object.freeze({kind:'frameweave.stage-ref' as const,id});
}
export interface CallOptions<I extends Ports=Ports>{inputs?:I;frame?:number;time?:number;signal?:AbortSignal;cache?:'none'}
export type RunOptions<I extends Ports=Ports>=Omit<CallOptions<I>,'inputs'>&({} extends I?{inputs?:I}:{inputs:I});
export interface RunResult<O extends Ports=Ports>{callId:string;stageId:string;context:FrameContext;outputs:O;diagnostics:Diagnostic[];cacheHit:false;shared?:SharedCommit}

export {stageInput,type CompositeDefinition,type StageInputRef,type NativeStageCalls,type NativeStagePorts,type NativeStageCallResult} from './composite-types.ts';
