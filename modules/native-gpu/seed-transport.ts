import {EngineError} from '../../src/core/errors.ts';
import type {NativeProgram} from './client.ts';

/** Private transport extension v1. Public typed-buffer and Stage contracts do
 * not change. Bulk words follow the bounded JSON header on the same pipe.
 * No files, paths, network access, native handles or new author permission.
 */
export const binarySeedThreshold=64*1024;
export interface NativeTransportLimits {maxControlBytes?:number;maxSeedBytes?:number;maxQueuedBytes?:number}
export function nativeTransportLimits(program:NativeProgram,limits:NativeTransportLimits={}){
 const metadataBytes=Buffer.byteLength(JSON.stringify({...program,data:program.data?.map(d=>({...d,initial:[]}))}))+1;
 const maxControlBytes=limits.maxControlBytes??Math.max(program.maxBytes,metadataBytes*2);
 const maxSeedBytes=limits.maxSeedBytes??program.maxBytes,maxQueuedBytes=limits.maxQueuedBytes??program.maxBytes;
 if(![maxControlBytes,maxSeedBytes,maxQueuedBytes].every(v=>Number.isSafeInteger(v)&&v>0))
  throw new EngineError('E_NATIVE_TRANSPORT_BUDGET','Transport limits must be positive safe byte counts supplied by the operator');
 return {maxControlBytes,maxSeedBytes};
}
export interface BinarySeedManifest {
 version:1;format:'words32-le';byteLength:number;
 buffers:{buffer:number;words:number;type:'f32'|'u32'|'i32'}[];
}
function* wordChunks(words:readonly number[]):Generator<Buffer>{
 // Transfer granularity only: arbitrarily many chunks may form one seed.
 const chunkWords=256*1024;
 for(let first=0;first<words.length;first+=chunkWords){
  const count=Math.min(chunkWords,words.length-first),raw=Buffer.allocUnsafe(count*4);
  for(let i=0;i<count;i++)raw.writeUInt32LE(words[first+i],i*4);
  yield raw;
 }
}
export function binarySeedRequest(op:'init'|'reconfigure',program:NativeProgram,maxSeedBytes=program.maxBytes){
 const rows=program.data??[];
 let bytes=0;
 for(const d of rows){
  if(!Number.isSafeInteger(d.length)||d.length<1||d.initial.length>d.length||!['f32','u32','i32'].includes(d.type))
   throw new EngineError('E_NATIVE_DATA','Invalid typed seed buffer');
  bytes+=d.initial.length*4;
 }
 if(!Number.isSafeInteger(maxSeedBytes)||maxSeedBytes<1||!Number.isSafeInteger(bytes)||bytes>maxSeedBytes||bytes>program.maxBytes)
  throw new EngineError('E_NATIVE_SEED_BUDGET','Binary seeds exceed the caller-configured transport or program budget');
 if(bytes<=binarySeedThreshold)return {command:{op,program},payload:[] as Iterable<Buffer>[]};
 if(program.version!==2)throw new EngineError('E_NATIVE_PROTOCOL','Binary typed seeds require native protocol 2');
 const binarySeeds:BinarySeedManifest={version:1,format:'words32-le',byteLength:bytes,buffers:[]};
 const payload:Iterable<Buffer>[]=[];
 const data=rows.map((d,buffer)=>{
  if(!d.initial.length)return d;
  if(d.sourceImage!==undefined||d.sourceResource!==undefined)throw new EngineError('E_NATIVE_DATA','An image view cannot contain CPU seed words');
  for(let i=0;i<d.initial.length;i++){
   const word=d.initial[i];
   if(!Number.isInteger(word)||word<0||word>0xffffffff)throw new EngineError('E_NATIVE_DATA','Seeds must contain exact unsigned 32-bit words');
  }
  binarySeeds.buffers.push({buffer,words:d.initial.length,type:d.type});payload.push(wordChunks(d.initial));
  return {...d,initial:[]};
 });
 return {command:{op,program:{...program,data},binarySeeds},payload};
}
