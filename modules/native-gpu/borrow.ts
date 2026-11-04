import type {NativeGpuScope} from './authoring.ts';
import {nativeScopeEvidence,registerNativeScope,revokeNativeScope,retireNativeLeaseResource} from './provenance.ts';
import {EngineError} from '../../src/core/errors.ts';
/** A module lease owns its allocations, never the Stage's shared device/scope. */
export function borrowNativeScope(owner:NativeGpuScope){
 const proof=nativeScopeEvidence(owner);if(!proof)throw new EngineError('E_PACKAGE_CAPABILITY','Native GPU requires a Stage-owned, hardware-admitted scope');
 const images=new Set<object>(),buffers=new Set<object>(),modules=new Set<object>();const temporalMarks=new WeakSet<object>();let closed=false;
 const dispose=async()=>{if(closed)return;closed=true;revokeNativeScope(scope);for(const [items,release]of [[images,owner.release.bind(owner)],[buffers,owner.releaseBuffer.bind(owner)],[modules,owner.releaseModule.bind(owner)]] as const){for(const value of items)try{if(items===modules||!retireNativeLeaseResource(owner,items===images?'image':'buffer',value))await (release as (v:any)=>Promise<void>)(value);}catch(e){if((e as any).code!=='E_NATIVE_SCOPE')throw e;}items.clear();}};
 const allocations=new Set(['convertColor','importResource','run','runModule','drawMesh','upload','createBuffer','createField','cloneBuffer','createModule','imageToBuffer','createStateBuffer','createStateField','createResidentBuffer','createResidentField','replaceResidentBuffer']);
 const api=new Proxy({} as NativeGpuScope,{get(_target,key){if(key==='dispose')return dispose;const method=owner[key as keyof NativeGpuScope];if(typeof method!=='function')return method;
  return async(...args:unknown[])=>{
   if(closed)throw new EngineError('E_PACKAGE_DISPOSE','Native module GPU lease is disposed');
   if(key==='stateStep'&&(args[0] as object[]).some(b=>!buffers.has(b)))throw new EngineError('E_NATIVE_RESOURCE_OWNER','A module cannot advance another lease’s GPU history');
   if(key==='replaceResidentBuffer'&&!buffers.has(args[0] as object))throw new EngineError('E_NATIVE_RESOURCE_OWNER','A module cannot replace another lease’s resident allocation');
   const released=key==='release'?images:key==='releaseBuffer'?buffers:key==='releaseModule'?modules:undefined;
   if(released&&!released.has(args[0] as object))throw new EngineError('E_NATIVE_RESOURCE_OWNER','A module cannot release another owner’s GPU allocation');
   let result:any;
   try{result=await (method as (...args:any[])=>any).apply(owner,args);}catch(error){
    // Ownership was checked above. An epoch-expired token is no longer useful
    // for lease cleanup; physical/in-flight resources still belong to owner.
    if(released&&(error as {code?:string}|null)?.code==='E_NATIVE_SCOPE')released.delete(args[0] as object);
    throw error;
   }
   if(key==='replaceResidentBuffer')buffers.delete(args[0] as object);
   if(released)released.delete(args[0] as object);
   if(key==='importBufferResource')buffers.add(result.buffer);
   if(allocations.has(String(key)))(key==='createModule'?modules:['createBuffer','createField','cloneBuffer','imageToBuffer','createStateBuffer','createStateField','createResidentBuffer','createResidentField','replaceResidentBuffer'].includes(String(key))?buffers:images).add(result);
   return result;
  };
 }});
 // Synchronous queries retain their public synchronous shape.
 const facade={...Object.fromEntries(['capabilities','stats','timings'].map(k=>[k,(owner as any)[k].bind(owner)]))};
 const scope=new Proxy(api,{get(target,key){return Object.hasOwn(facade,key)?(facade as any)[key]:Reflect.get(target,key);}});
 registerNativeScope(scope,proof);return {scope,dispose,temporalOwner:owner,
  /** Core-only handoff. The controller must validate the current fresh-image ticket. */
  grantTemporalImage(image:object,authorize:()=>void){if(closed)throw new EngineError('E_PACKAGE_DISPOSE','Native module lease closed during temporal sampling');if(images.has(image))throw new EngineError('E_NATIVE_TEMPORAL_OWNERSHIP','Temporal image already belongs to this lease');authorize();images.add(image);let active=true;return {image,revoke(){if(!active)return false;active=false;return images.delete(image);}};},
  temporalOpen:()=>!closed,
  temporalMark(){const mark={images:new Set(images),buffers:new Set(buffers)};temporalMarks.add(mark);return mark;},
  temporalFinish(mark:{images:Set<object>;buffers:Set<object>},result?:object){if(!temporalMarks.delete(mark))throw new EngineError('E_NATIVE_TEMPORAL_OWNERSHIP','Unknown or completed temporal ownership marker');for(const image of images)if(!mark.images.has(image)&&image!==result)images.delete(image);for(const buffer of buffers)if(!mark.buffers.has(buffer))buffers.delete(buffer);}
 };
}
