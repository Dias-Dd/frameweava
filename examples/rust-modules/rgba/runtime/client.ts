// SPDX-License-Identifier: Apache-2.0
import type {ModuleLoader} from '@frameweave/engine/plugins';
import {instantiateModule,ModuleError} from './session.mjs';
export interface ModuleClient {
  call(operation:number,input:Uint8Array,capacity:number):Promise<Uint8Array>;
  diagnostics():Promise<{disposed:boolean;buffers:number}>;
  dispose():Promise<{remainingBuffers:number}>;
}
export interface ClientOptions {worker?:boolean;initializationTimeoutMs?:number;signal?:AbortSignal}
/** Package IDs, resource URLs, hashes and permissions remain owned by P4-R1. */
export async function createModuleClient(load:ModuleLoader,options:ClientOptions={}):Promise<ModuleClient>{
  const timeout=options.initializationTimeoutMs??15000;
  if(!Number.isFinite(timeout)||timeout<=0)throw new ModuleError('E_WASM_ARGUMENT','initializationTimeoutMs must be positive');
  if(options.signal?.aborted)throw new ModuleError('E_WASM_CANCELLED','Module initialization cancelled');
  if(!options.worker){
    // R1 caches core instances per Stage. Verified raw bytes let each plugin own
    // its instance, even if the same package occurs twice in one pipeline.
    const session=await instantiateModule((await load({module:'bytes',format:'resource'})).slice().buffer);
    const cancel=()=>{session.dispose();};options.signal?.addEventListener('abort',cancel,{once:true});
    if(options.signal?.aborted){session.dispose();throw new ModuleError('E_WASM_CANCELLED','Module initialization cancelled');}
    return {async call(op,input,capacity){return session.call(op,input,capacity);},async diagnostics(){return session.diagnostics();},
      async dispose(){options.signal?.removeEventListener('abort',cancel);return session.dispose();}};
  }
  // Load verified bytes before transferring them. No Worker fetch or relative importScripts edges.
  const [bytes,source]=await Promise.all([load({module:'bytes',format:'resource'}),load({module:'worker',format:'resource'})]);
  if(options.signal?.aborted)throw new ModuleError('E_WASM_CANCELLED','Module initialization cancelled');
  const url=URL.createObjectURL(new Blob([new TextDecoder('utf-8',{fatal:true}).decode(source)],{type:'text/javascript'}));
  let worker:Worker;
  try{worker=new Worker(url);}catch(error){URL.revokeObjectURL(url);throw error;}
  let sequence=0,dead=false,closing=false,cleanup:Promise<{remainingBuffers:number}>|undefined;
  const pending=new Map<number,{resolve:(value:any)=>void;reject:(error:Error)=>void;timer?:ReturnType<typeof setTimeout>}>();
  function terminate(error=new ModuleError('E_WASM_DISPOSED','Module Worker terminated')){
    if(dead)return;dead=true;worker.terminate();URL.revokeObjectURL(url);options.signal?.removeEventListener('abort',cancel);
    for(const call of pending.values()){clearTimeout(call.timer);call.reject(error);}pending.clear();
  }
  function cancel(){terminate(new ModuleError('E_WASM_CANCELLED','Module Worker cancelled'));}
  options.signal?.addEventListener('abort',cancel,{once:true});
  worker.onmessage=({data})=>{
    const call=pending.get(data.id);if(!call)return;
    if(data.v!==1){terminate(new ModuleError('E_WASM_PROTOCOL','Worker response version mismatch'));return;}
    pending.delete(data.id);clearTimeout(call.timer);
    if(data.error)call.reject(new ModuleError(data.error.code,data.error.message));else call.resolve(data.result);
  };
  worker.onerror=event=>{event.preventDefault();terminate(new ModuleError('E_WASM_WORKER',event.message||'Module Worker failed'));};
  worker.onmessageerror=()=>terminate(new ModuleError('E_WASM_PROTOCOL','Worker message cannot be decoded'));
  function request<T>(method:string,data:Record<string,unknown>={},transfer:Transferable[]=[]):Promise<T>{
    if(dead||closing&&method!=='dispose')return Promise.reject(new ModuleError('E_WASM_DISPOSED','Module Worker is disposed'));
    const id=++sequence;
    return new Promise((resolve,reject)=>{
      // The Stage forbids timers during renderAt. Only initialization owns a
      // timer; in-frame calls retain the existing WebAdapter host deadline.
      const timer=method==='init'?setTimeout(()=>terminate(new ModuleError('E_WASM_TIMEOUT',`Worker init exceeded ${timeout} ms`)),timeout):undefined;
      pending.set(id,{resolve,reject,timer});
      try{worker.postMessage({v:1,id,method,...data},transfer);}catch(error){clearTimeout(timer);pending.delete(id);reject(error);}
    });
  }
  try{const copy=bytes.slice();await request('init',{bytes:copy.buffer},[copy.buffer]);}
  catch(error){terminate();throw error;}
  return {
    async call(operation,input,capacity){const copy=input.slice();return new Uint8Array(await request<ArrayBuffer>('call',{operation,input:copy.buffer,capacity},[copy.buffer]));},
    diagnostics(){return dead?Promise.resolve({disposed:true,buffers:0}):request('diagnostics');},
    dispose(){return cleanup??=(async()=>{if(dead)return {remainingBuffers:0};closing=true;try{return await request<{remainingBuffers:number}>('dispose');}finally{terminate();}})();},
  };
}
