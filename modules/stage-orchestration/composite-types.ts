import type {FrameContext,StageSpec,TVG} from '../../src/core/types.ts';
import {EngineError} from '../../src/core/errors.ts';
import type {NativeStagePorts} from './native-port-types.ts';
export type {NativeStagePorts,NativePortPacket} from './native-port-types.ts';

/** SO-2 v1. References are local to the immediate enclosing composite. */
export type StageInputRef={readonly $input:string}
export function stageInput(name:string):StageInputRef {
 if(typeof name!=='string'||!name)throw new EngineError('E_STAGE_INPUT_REFERENCE','A composite input name is required');
 return Object.freeze({$input:name});
}
export function isStageInput(value:unknown):value is StageInputRef {
 return !!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===1&&typeof (value as StageInputRef).$input==='string';
}
export interface CompositeDefinition {version:1;mode:'auto'|'explicit';stages:StageSpec[];publish?:Record<string,{ $ref:string;port:string }>}
export interface NativeStageCallResult<O extends NativeStagePorts=NativeStagePorts> {
 version:1;callId:string;stageId:string;context:Readonly<FrameContext>;outputs:O;cacheHit:false;
}
export interface NativeStageCalls {
 readonly version:1;
 /** Ordered, awaited calls to directly declared children; no implicit upstream execution. */
 run<O extends NativeStagePorts=NativeStagePorts>(stage:string|{readonly kind:'frameweave.stage-ref';readonly id:string},options?:{inputs?:NativeStagePorts}):Promise<NativeStageCallResult<O>>;
}
export interface StageDefinition {key:string;path:string[];stage:StageSpec}
export function stageScopeKey(path:readonly string[]):string {
 return path.length===1?path[0]:'so2_'+path.map(part=>part.length+'_'+part).join('_');
}
/** Iterative traversal: no policy nesting/count ceiling. Existing byte/device budgets apply. */
export function stageDefinitions(tvg:Pick<TVG,'stages'>):StageDefinition[] {
 const pending=tvg.stages.map(stage=>({stage,path:[stage.id]})).reverse(),result:StageDefinition[]=[],keys=new Set<string>();
 while(pending.length){const item=pending.pop()!,key=stageScopeKey(item.path);if(keys.has(key))throw new EngineError('E_STAGE_DUPLICATE','Compiled Stage scope identities collide',{stageId:key});keys.add(key);result.push({...item,key});
  if(item.stage.composition)for(let i=item.stage.composition.stages.length-1;i>=0;i--){const stage=item.stage.composition.stages[i];pending.push({stage,path:[...item.path,stage.id]});}
 }
 return result;
}
