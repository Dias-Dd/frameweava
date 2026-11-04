import { createHash } from 'node:crypto';
import type { StageFrameResult } from '../core/types.ts';
import {isProfessionalSurface} from '../media/surface.ts';
import {surfaceBytes,snapshotSurface} from '../media/surface-storage.ts';

const byteHashes=new WeakMap<Uint8Array,string>();
export function hashSurfaceBytes(bytes:Uint8Array):string{let digest=byteHashes.get(bytes);if(!digest){digest=createHash('sha256').update(bytes).digest('hex');byteHashes.set(bytes,digest);}return digest;}
export function hashValue(value:unknown):string{return createHash('sha256').update(JSON.stringify(value,(_key,v)=>{
  if(v instanceof Uint8Array)return {binary:'audio-cpu',sha256:createHash('sha256').update(v).digest('hex'),byteLength:v.byteLength};
  if(!isProfessionalSurface(v))return v;
  const bytes=surfaceBytes(v),digest=hashSurfaceBytes(bytes);
  return {...v,storage:{location:'cpu-inline',encoding:'sha256-bytes/1',byteLength:bytes.length,digest}};
})).digest('hex');}
/** Fresh mutable metadata, private immutable pixel snapshots. No borrowed typed array escapes. */
export function cloneMediaValue<T>(value:T):T {
  function copy(v:any):any{if(isProfessionalSurface(v))return snapshotSurface(v);if(Buffer.isBuffer(v))return Buffer.from(v);if(Array.isArray(v))return v.map(copy);if(v&&Object.getPrototypeOf(v)===Object.prototype)return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,copy(x)]));return structuredClone(v);}return copy(value);
}
function estimate(value:unknown):number {
  if(isProfessionalSurface(value))return surfaceBytes(value).length+512;
  if(typeof value==='string')return value.length*2;if(typeof value!=='object'||!value)return 8;
  if(ArrayBuffer.isView(value))return value.byteLength;if(value instanceof ArrayBuffer)return value.byteLength;
  return Object.entries(value).reduce((n,[k,v])=>n+k.length*2+estimate(v),32);
}

/** Bounded process-local LRU. Build and renderer fingerprints are part of every key. */
export class ValueCache<T> {
  private entries=new Map<string,{value:T;bytes:number}>();
  private bytes=0;
  constructor(private budgetBytes=128*1024*1024){}
  get(key:string){const entry=this.entries.get(key);if(!entry)return undefined;this.entries.delete(key);this.entries.set(key,entry);return cloneMediaValue(entry.value);}
  set(key:string,value:T){
    const old=this.entries.get(key);if(old){this.bytes-=old.bytes;this.entries.delete(key);}
    const bytes=estimate(value);if(bytes>this.budgetBytes)return;
    this.entries.set(key,{value:cloneMediaValue(value),bytes});this.bytes+=bytes;
    while(this.bytes>this.budgetBytes){const oldest=this.entries.keys().next().value;if(oldest===undefined)break;const entry=this.entries.get(oldest)!;this.bytes-=entry.bytes;this.entries.delete(oldest);}
  }
  clear(){this.entries.clear();this.bytes=0;}
  status(){return {entries:this.entries.size,bytes:this.bytes,budget:this.budgetBytes};}
}
export class StageCache extends ValueCache<StageFrameResult>{}
