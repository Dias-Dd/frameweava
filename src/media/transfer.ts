import {isProfessionalSurface,assertProfessionalSurface,encodeBytes,type ProfessionalSurface} from './surface.ts';
import {surfaceBytes,ownSurfaceBytes} from './surface-storage.ts';
import {EngineError} from '../core/errors.ts';

export interface SurfaceTransfer {
  kind:'frameweave.surface-transfer';version:1;
  descriptor:Omit<ProfessionalSurface,'storage'>;
  byteLength:number;sha256:string;url:string;
  ownership:'value';lifetime:'call';
}
export const isSurfaceTransfer=(v:any):v is SurfaceTransfer=>v?.kind==='frameweave.surface-transfer';
export function transferDescriptor(s:ProfessionalSurface):SurfaceTransfer['descriptor']{assertProfessionalSurface(s);const {storage,...descriptor}=s;return {...descriptor,color:{...s.color}};}
export function transferSurface(w:SurfaceTransfer,bytes:Uint8Array):ProfessionalSurface{
  if(w.version!==1||w.ownership!=='value'||w.lifetime!=='call'||bytes.length!==w.byteLength||!/^[a-f0-9]{64}$/.test(w.sha256))throw new EngineError('E_MEDIA_TRANSFER','Invalid version/ownership/length/hash');
  const s:ProfessionalSurface={...w.descriptor,storage:{location:'cpu-inline',encoding:'base64',byteOrder:'little-endian',ownership:'value',lifetime:'frame',data:''}};
  ownSurfaceBytes(s,bytes,encodeBytes);assertProfessionalSurface(s);return s;
}
export async function mapMediaValues(value:any,map:(s:ProfessionalSurface)=>Promise<unknown>):Promise<any>{
  if(isProfessionalSurface(value))return map(value);if(Array.isArray(value))return Promise.all(value.map(v=>mapMediaValues(v,map)));
  if(value&&Object.getPrototypeOf(value)===Object.prototype)return Object.fromEntries(await Promise.all(Object.entries(value).map(async([k,v])=>[k,await mapMediaValues(v,map)])));
  return value;
}
export async function resolveMediaTransfers(value:any,resolve:(w:SurfaceTransfer)=>Promise<ProfessionalSurface>):Promise<any>{
  if(isSurfaceTransfer(value))return resolve(value);if(Array.isArray(value))return Promise.all(value.map(v=>resolveMediaTransfers(v,resolve)));
  if(value&&Object.getPrototypeOf(value)===Object.prototype)return Object.fromEntries(await Promise.all(Object.entries(value).map(async([k,v])=>[k,await resolveMediaTransfers(v,resolve)])));
  return value;
}
async function digest(bytes:Uint8Array){if(!globalThis.crypto?.subtle)throw new EngineError('E_MEDIA_TRANSFER_UNAVAILABLE','Binary transfer requires browser SHA-256');return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes as Uint8Array<ArrayBuffer>)),n=>n.toString(16).padStart(2,'0')).join('');}
export async function uploadSurfaces(value:unknown,url:string):Promise<unknown>{
  return mapMediaValues(value,async s=>{const bytes=surfaceBytes(s),sha256=await digest(bytes),r=await fetch(url,{method:'POST',credentials:'omit',redirect:'error',body:new Blob([bytes as Uint8Array<ArrayBuffer>],{type:'text/plain'})});if(!r.ok)throw new EngineError('E_MEDIA_TRANSFER',`Surface upload failed (${r.status})`);await r.text();return {kind:'frameweave.surface-transfer',version:1,descriptor:transferDescriptor(s),byteLength:bytes.length,sha256,url,ownership:'value',lifetime:'call'} satisfies SurfaceTransfer;});
}
export async function downloadSurfaces(value:unknown,origin:string):Promise<any>{
  return resolveMediaTransfers(value,async w=>{const u=new URL(w.url);if(u.origin!==origin||!/^\/__frameweave_surface\/[a-f0-9]{64}$/.test(u.pathname)||u.search||u.hash||!Number.isInteger(w.byteLength)||w.byteLength<1||w.byteLength>256*1024*1024)throw new EngineError('E_MEDIA_TRANSFER','Invalid private resource capability');const r=await fetch(w.url,{credentials:'omit',redirect:'error'});if(!r.ok||Number(r.headers.get('content-length'))!==w.byteLength)throw new EngineError('E_MEDIA_TRANSFER',`Surface download failed (${r.status}) or length disagrees`);const bytes=new Uint8Array(await r.arrayBuffer());if(await digest(bytes)!==w.sha256)throw new EngineError('E_MEDIA_TRANSFER_HASH','Surface bytes changed');return transferSurface(w,bytes);});
}
