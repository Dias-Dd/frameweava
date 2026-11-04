import {EngineError} from '../../src/core/errors.ts';
/** Authoring data snapshot, also usable in AU-1's VM, which has no structuredClone.
 * This is local to editing; it neither changes globals nor exposes host capabilities. */
export function cloneEditData<T>(value:T):T {
 if(typeof globalThis.structuredClone==='function')return globalThis.structuredClone(value);
 const copies=new WeakMap<object,unknown>();
 function copy(v:any):any {
  if(v===null||typeof v!=='object'){
   if(typeof v==='function'||typeof v==='symbol')throw new EngineError('E_EDIT_DATA','Authoring data cannot contain functions or symbols');
   return v;
  }
  if(copies.has(v))return copies.get(v);
  if(ArrayBuffer.isView(v)){if(v instanceof DataView)return new DataView(v.buffer.slice(v.byteOffset,v.byteOffset+v.byteLength));return (v as Uint8Array).slice();}
  if(v instanceof ArrayBuffer)return v.slice(0);
  if(!Array.isArray(v)&&![Object.prototype,null].includes(Object.getPrototypeOf(v)))throw new EngineError('E_EDIT_DATA','Use plain authoring data, not live instances');
  const result=Array.isArray(v)?[]:{};copies.set(v,result);for(const [key,entry]of Object.entries(v))Object.defineProperty(result,key,{value:copy(entry),writable:true,enumerable:true,configurable:true});return result;
 }
 return copy(value);
}
