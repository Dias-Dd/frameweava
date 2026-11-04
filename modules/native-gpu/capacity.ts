import {EngineError} from '../../src/core/errors.ts';

/** Caller byte budgets bound command metadata, not an artificial object count.
 * Typed seeds have their own existing binary/body admission and are excluded. */
export function nativeMetadataBytes(value:unknown):number {
 try {
  const object=value as {data?:unknown[]};
  const projected=object&&typeof object==='object'&&Array.isArray(object.data)?{...object,data:object.data.map(d=>({...d as object,initial:[]}))}:value;
  const text=JSON.stringify(projected);
  if(text===undefined)throw new Error('Expected a command object');
  return new TextEncoder().encode(text).byteLength;
 } catch(error) {
  throw new EngineError('E_NATIVE_METADATA','Native metadata must be serializable',{details:{cause:String(error)}});
 }
}
export function assertNativeMetadata(value:unknown,maxBytes:number,details?:Record<string,unknown>){
 return assertNativeMetadataBytes(nativeMetadataBytes(value),maxBytes,details);
}
export function assertNativeMetadataBytes(bytes:number,maxBytes:number,details?:Record<string,unknown>){
 if(!Number.isSafeInteger(bytes)||bytes<0||!Number.isSafeInteger(maxBytes)||maxBytes<1||bytes>maxBytes)
  throw new EngineError('E_NATIVE_METADATA_BUDGET','Native command metadata exceeds the caller byte budget',{details:{...details,bytes,maxBytes}});
 return bytes;
}
