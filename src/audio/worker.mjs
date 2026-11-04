// One owned CPU worker per Stage; a fresh realm/factory per stateless interval prevents residue.
// Local project code is trusted by the existing compiler policy. VM restrictions are defense in
// depth, not a claim that node:vm is an OS security sandbox for malicious third-party Node code.
import {parentPort,workerData,receiveMessageOnPort} from 'node:worker_threads';
import {createContext,runInContext,Script} from 'node:vm';

// Only this trusted worker sees the MessagePort/Atomics wakeup. Authored realms
// receive realm-native functions/data, never Node callbacks, ports or host errors.
const resourcePort=workerData.resourcePort,wake=new Int32Array(workerData.resourceWake);let resourceCall=0;
function resourceRpc(op,arg){
  const id=++resourceCall,deadline=performance.now()+workerData.timeoutMs;resourcePort.postMessage({id,op,arg});
  for(;;){const version=Atomics.load(wake,0),reply=receiveMessageOnPort(resourcePort)?.message;
    if(reply){if(reply.id!==id)throw Error('[E_AUDIO_RESOURCE] Audio RPC identity mismatch');return reply;}
    const remaining=deadline-performance.now();if(remaining<=0)throw Error('[E_STAGE_TIMEOUT] Audio resource request timed out');
    Atomics.wait(wake,0,version,remaining);
  }
}

function realmCopy(value,allocator){
  if(value===null||typeof value!=='object')return value;
  if(value instanceof Uint8Array)return allocator.bytes(value);
  const target=Array.isArray(value)?allocator.array():allocator.object();
  for(const key of Object.keys(value))allocator.put(target,key,realmCopy(value[key],allocator));
  return target;
}
function realm(payload){
  const context=createContext(Object.create(null),{codeGeneration:{strings:false,wasm:false}});
  // Capture realm allocation/copy primitives BEFORE authored code can replace
  // constructors or prototype.set. RPC replies arrive after authored execution;
  // invoking a replaced set() with a host typed array would leak a host object.
  const allocator=runInContext(`(()=>{const U=Uint8Array,set=Uint8Array.prototype.set,apply=Reflect.apply,create=Object.create,define=Object.defineProperty;return {
    bytes(source){const target=new U(source.byteLength);apply(set,target,[source]);return target;},
    array(){return [];},object(){return create(null);},put(target,key,value){define(target,key,{value,writable:true,enumerable:true,configurable:true});}
  };})()`,context);
  context.__fw_init=realmCopy(workerData.init,allocator);context.__fw_request=realmCopy(payload.request,allocator);
  context.__fw_inputs=realmCopy(payload.inputs,allocator);context.__fw_props=realmCopy(payload.props,allocator);
  const install=runInContext(`(invoke,ids)=>{
    const call=(op,arg)=>{const reply=invoke(op,JSON.stringify(arg));if(!reply.ok){const e=new Error(reply.error.message);e.code=reply.error.code;e.details=reply.error.details;throw e;}return reply.value;};
    const resources=Object.create(null);for(const id of ids)Object.defineProperty(resources,id,{enumerable:true,get(){return call('bytes',id);}});
    return {resources,audio:Object.freeze({async read(request){return call('read',request);},async info(resourceId,stream){return call('info',{resourceId,stream});}})};
  }`,context);
  const services=install((op,json)=>{try{return realmCopy(resourceRpc(op,JSON.parse(json)),allocator);}catch(error){return realmCopy({ok:false,error:{code:error?.message?.match(/\[(E_[A-Z_]+)\]/)?.[1]??'E_AUDIO_RESOURCE',message:'Audio resource bridge failed'}},allocator);}},realmCopy(workerData.resourceIds,allocator));
  context.__fw_init.resources=services.resources;context.__fw_init.audio=services.audio;
  new Script(`globalThis.process=undefined;globalThis.require=undefined;globalThis.fetch=undefined;globalThis.WebAssembly=undefined;globalThis.SharedArrayBuffer=undefined;globalThis.Atomics=undefined;globalThis.Date=undefined;Math.random=()=>{throw Error('[E_AUDIO_CLOCK] Use sample coordinates and deterministic functions for audio')};`).runInContext(context,{timeout:workerData.timeoutMs});
  new Script(workerData.code,{filename:'audio-stage.js'}).runInContext(context,{timeout:workerData.timeoutMs});
  return context;
}
function bound(value){let bytes=0,nodes=0;const seen=new Set();function visit(v,depth=0){if(depth>96||++nodes>100000)throw Error('[E_AUDIO_OUTPUT] Output nesting/node budget exceeded');if(typeof v==='string')bytes+=v.length*2;if(v&&typeof v==='object'){if(seen.has(v))throw Error('[E_AUDIO_OUTPUT] Cyclic output');seen.add(v);if(ArrayBuffer.isView(v)||v instanceof ArrayBuffer)bytes+=v.byteLength;else for(const key of Object.keys(v))visit(v[key],depth+1);seen.delete(v);}if(bytes>16*1024*1024)throw Error('[E_AUDIO_BYTES] Output binary/metadata budget exceeded');}visit(value);}
parentPort.on('message',async payload=>{
  try{
    parentPort.postMessage({started:true});
    const context=realm(payload),name=JSON.stringify(workerData.exportName),method=payload.mode==='frame'?'renderAt':'evaluateInterval';
    const result=await new Script(`(async()=>{const factory=__fw_audio_module[${name}];if(typeof factory!=='function')throw Error('[E_AUDIO_FACTORY] Audio entry must export a factory');const stage=await factory(__fw_init);try{if(typeof stage.${method}!=='function')throw Error('[E_AUDIO_CAPABILITY] Audio Stage does not implement ${method}');return await stage.${method}(__fw_request,__fw_inputs,__fw_props);}finally{await stage.dispose?.();}})()`).runInContext(context,{timeout:workerData.timeoutMs});
    bound(result);parentPort.postMessage({ok:true,outputs:structuredClone(result)});
  }catch(error){let code=typeof error?.code==='string'?error.code:error?.message?.match(/\[(E_[A-Z_]+)\]/)?.[1]??'E_AUDIO_RUNTIME';if(code==='ERR_SCRIPT_EXECUTION_TIMEOUT')code='E_STAGE_TIMEOUT';parentPort.postMessage({ok:false,error:{code,message:String(error?.message??error).slice(0,8000),details:error?.details}});}
});
parentPort.postMessage({ready:true});
