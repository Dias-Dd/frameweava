// SPDX-License-Identifier: Apache-2.0
import type {ModuleLoader} from '@frameweave/engine/plugins';
import {createSession,BindgenError,type Profile,type Diagnostics} from './session.mjs';
import {cloneData} from './wire.ts';
export interface Options {worker?:boolean;signal?:AbortSignal;initializationTimeoutMs?:number}
export interface Client {invoke(name:string,args:unknown[]):Promise<unknown>;diagnostics():Promise<Diagnostics&{initializationMs?:number}>;dispose():Promise<{remainingSessions:number}>}
export async function createClient(load:ModuleLoader,options:Options={}):Promise<Client>{
  const timeout=options.initializationTimeoutMs??15000;if(!Number.isFinite(timeout)||timeout<=0)throw new BindgenError('E_BINDGEN_ARGUMENT','Invalid initialization timeout');
  if(options.signal?.aborted)throw new BindgenError('E_BINDGEN_CANCELLED','Initialization cancelled');
  const [bytes,encoded,source]=await Promise.all([load({module:'bytes',format:'resource'}),load({module:'profile',format:'resource'}),options.worker?load({module:'worker',format:'resource'}):Promise.resolve(undefined)]);
  const profile=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(encoded)) as Profile;
  if(profile.id!=='wasm-bindgen-data-v1'||!Array.isArray(profile.resources)||profile.resources.length>48)throw new BindgenError('E_BINDGEN_PROFILE','Invalid profile resources');
  // Reverify glue, snippets and declarations as R1 resources, not undeclared URLs.
  await Promise.all(profile.resources.map(module=>load({module,format:'resource'})));
  if(options.signal?.aborted)throw new BindgenError('E_BINDGEN_CANCELLED','Initialization cancelled');
  if(!options.worker){
    const binding=await load({module:'binding',format:'javascript'});
    const session=await createSession(bytes.slice().buffer,profile,binding.createBinding as ()=>Record<string,any>);
    const cancel=()=>{session.dispose();};options.signal?.addEventListener('abort',cancel,{once:true});
    if(options.signal?.aborted){session.dispose();throw new BindgenError('E_BINDGEN_CANCELLED','Initialization cancelled');}
    return {async invoke(name,args){cloneData(args);return session.invoke(name,args);},async diagnostics(){return session.diagnostics();},async dispose(){options.signal?.removeEventListener('abort',cancel);return session.dispose();}};
  }
  const url=URL.createObjectURL(new Blob([new TextDecoder('utf-8',{fatal:true}).decode(source!)],{type:'text/javascript'}));let worker:Worker;
  try{worker=new Worker(url);}catch(error){URL.revokeObjectURL(url);throw error;}
  let sequence=0,dead=false,closing=false,cleanup:Promise<{remainingSessions:number}>|undefined;
  const pending=new Map<number,{resolve:(value:any)=>void;reject:(error:Error)=>void;timer?:ReturnType<typeof setTimeout>}>();
  function terminate(error=new BindgenError('E_BINDGEN_DISPOSED','Worker terminated')){if(dead)return;dead=true;worker.terminate();URL.revokeObjectURL(url);options.signal?.removeEventListener('abort',cancel);for(const call of pending.values()){clearTimeout(call.timer);call.reject(error);}pending.clear();}
  function cancel(){terminate(new BindgenError('E_BINDGEN_CANCELLED','Worker cancelled'));}options.signal?.addEventListener('abort',cancel,{once:true});
  worker.onmessage=({data})=>{const call=pending.get(data.id);if(!call)return;if(data.v!==1){terminate(new BindgenError('E_BINDGEN_PROTOCOL','Response version mismatch'));return;}pending.delete(data.id);clearTimeout(call.timer);if(data.error)call.reject(new BindgenError(data.error.code,data.error.message));else call.resolve(data.result);};
  worker.onerror=event=>{event.preventDefault();terminate(new BindgenError('E_BINDGEN_WORKER',event.message||'Worker failed'));};
  worker.onmessageerror=()=>terminate(new BindgenError('E_BINDGEN_PROTOCOL','Message decode failed'));
  function request<T>(method:string,data:Record<string,unknown>={},transfer:Transferable[]=[]):Promise<T>{
    if(dead||closing&&method!=='dispose')return Promise.reject(new BindgenError('E_BINDGEN_DISPOSED','Binding disposed'));
    const id=++sequence;return new Promise((resolve,reject)=>{
      // No timers are created during renderAt: frame deadlines remain with WebAdapter.
      const timer=method==='init'?setTimeout(()=>terminate(new BindgenError('E_BINDGEN_TIMEOUT','Worker initialization timed out')),timeout):undefined;
      pending.set(id,{resolve,reject,timer});try{worker.postMessage({v:1,id,method,...data},transfer);}catch(error){clearTimeout(timer);pending.delete(id);reject(error);}
    });
  }
  try{const copy=bytes.slice();await request('init',{bytes:copy.buffer,profile},[copy.buffer]);}catch(error){terminate();throw error;}
  return {
    invoke(name,args){const transfer:ArrayBuffer[]=[],copy=cloneData(args,transfer);return request('invoke',{name,args:copy},transfer);},
    diagnostics(){return dead?Promise.resolve({disposed:true,liveSessions:0,memoryBytes:0}):request('diagnostics');},
    dispose(){return cleanup??=(async()=>{if(dead)return {remainingSessions:0};closing=true;try{return await request<{remainingSessions:number}>('dispose');}finally{terminate();}})();},
  };
}
