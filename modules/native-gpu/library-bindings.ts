import type {NativePluginInit} from '../../src/plugins/sdk.ts';
import {EngineError} from '../../src/core/errors.ts';
/** R1 lifecycle adapter for ordinary library functions. Algorithms and parameter
 * semantics are unchanged; factories receive the module's admitted GPU lease. */
export function nativeLibraryBindings(init:NativePluginInit,functions:Record<string,unknown>){
 if(init.backend!=='native-gpu'||!init.gpu||!init.gpu.capabilities().hardwareVerified)throw new EngineError('E_PACKAGE_CAPABILITY','Native libraries require the admitted hardware GPU scope');
 let closed=false;const instances=new Set<{dispose:()=>unknown}>(),pending=new Set<Promise<unknown>>();
 const retain=(v:any)=>{if(v&&typeof v.dispose==='function')instances.add(v);return v;};
 const exports=Object.fromEntries(Object.entries(functions).filter(([,fn])=>typeof fn==='function').map(([name,fn])=>[name,(...args:unknown[])=>{
  if(closed)throw new EngineError('E_PACKAGE_DISPOSE','Library scope is closed');
  if(args[0]&&typeof args[0]==='object'&&'gpu'in args[0])args[0]={...args[0],gpu:init.gpu};
  const result=(fn as Function)(...args);if(result&&typeof result.then==='function'){const p=Promise.resolve(result).then(retain);pending.add(p);void p.then(()=>pending.delete(p),()=>pending.delete(p));return p;}return retain(result);
 }]));
 return {exports,async dispose(){if(closed)return;closed=true;await Promise.allSettled([...pending]);const results=await Promise.allSettled([...instances].map(v=>v.dispose()));instances.clear();const failure=results.find(r=>r.status==='rejected');if(failure?.status==='rejected')throw failure.reason;}};
}
