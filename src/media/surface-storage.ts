import {assertProfessionalSurface,decodeBytes,encodeBytes,type ProfessionalSurface} from './surface.ts';

// Engine-private immutable bytes. Never export borrowed buffers from public SDK entries.
// Data remains a string in the public Surface v2/JSON contract, materialized on demand.
const raw=new WeakMap<ProfessionalSurface,{storage:ProfessionalSurface['storage'];getter:()=>string;bytes:Uint8Array}>();
const decoded=new WeakMap<ProfessionalSurface,{storage:ProfessionalSurface['storage'];data:string;bytes:Uint8Array}>();
let deferred=false;
export function deferStageSurfaces(enabled:boolean){deferred=enabled;}
export function stageSurfacesDeferred(){return deferred;}
export function privateSurfaceBytes(s:ProfessionalSurface):Uint8Array|undefined{
  const record=raw.get(s),property=s?.storage&&Object.getOwnPropertyDescriptor(s.storage,'data');
  if(record&&record.storage===s.storage&&property?.get===record.getter)return record.bytes;
  const plain=decoded.get(s);return plain&&plain.storage===s.storage&&property&&'value' in property&&property.value===plain.data?plain.bytes:undefined;
}
export function rememberSurfaceBytes(s:ProfessionalSurface,bytes:Uint8Array){decoded.set(s,{storage:s.storage,data:s.storage.data,bytes});}
export function surfaceBytes(s:ProfessionalSurface){assertProfessionalSurface(s);let bytes=privateSurfaceBytes(s);if(!bytes){bytes=decodeBytes(s.storage.data);rememberSurfaceBytes(s,bytes);}return bytes;}
export function snapshotSurface(s:ProfessionalSurface):ProfessionalSurface{
  const bytes=surfaceBytes(s),copy:ProfessionalSurface={...s,color:{...s.color},storage:{location:'cpu-inline',encoding:'base64',byteOrder:'little-endian',ownership:'value',lifetime:'frame',data:''}};
  return ownSurfaceBytes(copy,bytes,encodeBytes);
}
export function ownSurfaceBytes(s:ProfessionalSurface,bytes:Uint8Array,encode:(b:Uint8Array)=>string):ProfessionalSurface{
  let data:string|undefined;const getter=()=>data??=encode(bytes);
  Object.defineProperty(s.storage,'data',{enumerable:true,configurable:true,get:getter,set(value:string){raw.delete(s);Object.defineProperty(s.storage,'data',{value,writable:true,enumerable:true,configurable:true});}});
  raw.set(s,{storage:s.storage,getter,bytes});return s;
}
