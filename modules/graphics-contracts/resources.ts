import {bounded,fail} from './check.ts';
import {resourceReference} from './validate.ts';
import type {ResourceReference,GraphicsData} from './types.ts';

export async function sha256(bytes:Uint8Array):Promise<string> {
  const digest=await crypto.subtle.digest('SHA-256',new Uint8Array(bytes).buffer);
  return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
}
/** Pure byte verification; does not fetch, open paths, infer permission or consult a global store. */
export async function verifyResource(input:ResourceReference,bytes:Uint8Array):Promise<void> {
  bounded(input);const ref=resourceReference(input);
  if(bytes.byteLength!==ref.bytes)fail(`resource:${ref.resourceId}`,'byte length mismatch','E_GRAPHICS_INTEGRITY');
  if(await sha256(bytes)!==ref.sha256)fail(`resource:${ref.resourceId}`,'SHA-256 mismatch','E_GRAPHICS_INTEGRITY');
}
/** The caller supplies an explicit capability. Missing bytes are errors, never implicit network access. */
export async function verifyResources(refs:readonly ResourceReference[],read:(id:string)=>Promise<Uint8Array|undefined>):Promise<void> {
  const seen=new Map<string,ResourceReference>();
  for(const input of refs){bounded(input);const ref=resourceReference(input),old=seen.get(ref.resourceId);
    if(old){if(old.kind!==ref.kind||old.sha256!==ref.sha256||old.bytes!==ref.bytes)fail(`resource:${ref.resourceId}`,'conflicting resource identities','E_GRAPHICS_INTEGRITY');continue;}
    seen.set(ref.resourceId,ref);const bytes=await read(ref.resourceId);if(!bytes)fail(`resource:${ref.resourceId}`,'missing declared resource','E_GRAPHICS_RESOURCE');await verifyResource(ref,bytes);
  }
}
export function resourceReferences(data:GraphicsData):ResourceReference[] {
  switch(data.schema){
    case 'frameweave.mask':return data.kind==='raster'?[data.source]:[];
    case 'frameweave.mesh':return data.material?.texture?[data.material.texture]:[];
    case 'frameweave.text-layout':return data.fonts.map(f=>f.source);
    default:return [];
  }
}
/** Hash exact UTF-8 file bytes before parsing. Never hash a reserialized substitute for a signed file. */
export async function readJsonResource<T>(ref:ResourceReference,bytes:Uint8Array,validate:(input:unknown)=>T):Promise<T> {
  if(ref.kind!=='file')fail('resource.kind','JSON requires a file Resource');
  const snapshot=new Uint8Array(bytes);await verifyResource(ref,snapshot);
  let data:unknown;try{data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(snapshot));}catch{fail(`resource:${ref.resourceId}`,'invalid UTF-8 JSON');}
  return validate(data);
}
