import {EngineError} from '../core/errors.ts';
import type {Json} from '../core/types.ts';

/** Host-only per-request data. It cannot change Stage edges, engines or permissions. */
export interface FrameExecution {readonly stageProps?:Readonly<Record<string,Readonly<Record<string,Json>>>>}
export const FRAME_EXECUTION_LIMITS={stages:256,bytes:4*1024*1024,nodes:65536,depth:16} as const;
const fail=(code:string,message:string):never=>{throw new EngineError(code,message);};
const plain=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&Object.getPrototypeOf(v)===Object.prototype;
function fields(v:object):Record<string,PropertyDescriptor>{
  if(Object.getOwnPropertySymbols(v).length)fail('E_FRAME_EXECUTION','Symbol properties are unsupported');
  const descriptors=Object.getOwnPropertyDescriptors(v);
  for(const [key,d]of Object.entries(descriptors))if(!(Array.isArray(v)&&key==='length')&&(!d.enumerable||!('value' in d)))fail('E_FRAME_EXECUTION','Only enumerable data properties are supported');
  return descriptors;
}
/** Call at API entry, before queueing. Returned JSON is copied and deeply frozen. */
export function captureFrameExecution(execution:FrameExecution|undefined,stageIds:Iterable<string>):FrameExecution|undefined{
  if(execution===undefined)return;
  if(!plain(execution))return fail('E_FRAME_EXECUTION','FrameExecution must be a plain object');
  const descriptors=fields(execution);if(Object.keys(descriptors).some(k=>k!=='stageProps'))fail('E_FRAME_EXECUTION','Unknown FrameExecution field');
  if(!Object.hasOwn(descriptors,'stageProps'))return Object.freeze({});
  const overrides=descriptors.stageProps.value;if(!plain(overrides))return fail('E_FRAME_EXECUTION','stageProps must be a plain object');
  const stages=fields(overrides),ids=new Set(stageIds),names=Object.keys(stages);
  if(names.length>FRAME_EXECUTION_LIMITS.stages)fail('E_FRAME_EXECUTION_BUDGET','Too many per-frame Stage overrides');
  for(const id of names){if(!ids.has(id))fail('E_FRAME_EXECUTION_STAGE','Unknown Stage in execution input');if(!plain(stages[id].value))fail('E_FRAME_EXECUTION','Each Stage override must be a plain props object');}
  let nodes=0;const seen=new Set<object>();
  function visit(v:unknown,depth:number):void{
    if(++nodes>FRAME_EXECUTION_LIMITS.nodes||depth>FRAME_EXECUTION_LIMITS.depth)fail('E_FRAME_EXECUTION_BUDGET','Execution input exceeds node/depth budget');
    if(v===null||typeof v==='boolean')return;
    if(typeof v==='number'){if(!Number.isFinite(v))fail('E_FRAME_EXECUTION','Numbers must be finite');return;}
    if(typeof v==='string'){if(v.length>FRAME_EXECUTION_LIMITS.bytes)fail('E_FRAME_EXECUTION_BUDGET','Execution input exceeds byte budget');return;}
    if(!v||typeof v!=='object'||(!plain(v)&&!Array.isArray(v))||seen.has(v))fail('E_FRAME_EXECUTION','Execution input must be acyclic plain JSON');
    const d=fields(v as object),keys=Object.keys(v as object);
    if(Array.isArray(v)&&(keys.length!==v.length||keys.some((key,index)=>key!==String(index))))fail('E_FRAME_EXECUTION','Sparse/extended arrays are unsupported');
    seen.add(v as object);for(const key of keys)visit(d[key].value,depth+1);seen.delete(v as object);
  }
  visit(execution,0);const encoded=JSON.stringify(execution);
  if(new TextEncoder().encode(encoded).length>FRAME_EXECUTION_LIMITS.bytes)fail('E_FRAME_EXECUTION_BUDGET','Execution input exceeds 4 MiB UTF-8');
  const result=JSON.parse(encoded) as FrameExecution;
  const freeze=(v:unknown)=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}};freeze(result);return result;
}
/** Merge AFTER authored props evaluation. Overrides must never be evaluated as expressions. */
export function frameStageProps(evaluated:Record<string,unknown>,stageId:string,execution:FrameExecution|undefined):Record<string,unknown>{
  const extra=execution?.stageProps&&Object.hasOwn(execution.stageProps,stageId)?execution.stageProps[stageId]:undefined;
  return extra?{...evaluated,...extra}:evaluated;
}
