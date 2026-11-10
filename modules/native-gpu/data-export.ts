import {mkdir,mkdtemp,readFile,unlink,rmdir} from 'node:fs/promises';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {endianness} from 'node:os';
import {EngineError} from '../../src/core/errors.ts';
import {runtimeCachePath} from '../../src/runtime/paths.ts';
import {fieldInfo} from '../gpu-effects/compute-contract.ts';
import type {GpuDataInfo,GpuWords} from '../gpu-effects/compute-types.ts';
import type {NativeProgram,NativeFrameTicket,NativeGpuClient} from './client.ts';
export interface NativeBufferValue {version:1;frame:number;publication:number;info:GpuDataInfo;values:GpuWords}
/** Explicit host export adapter, not a Stage executor. It cannot be imported
 * into authored browser logic. No export/readback occurs merely by publishing. */
export class NativeBufferExporter {
 private closed=false;private closing?:Promise<void>;private active=new Set<Promise<unknown>>();
 private constructor(readonly lease:{version:1;directory:string}){}
 static async create(){const base=runtimeCachePath('native-data-export');await mkdir(base,{recursive:true});return new NativeBufferExporter({version:1,directory:await mkdtemp(join(base,'lease-'))});}
 configure(program:NativeProgram){if(this.closed||this.closing)throw new EngineError('E_NATIVE_DATA_CLOSED','Buffer exporter is closed');program.dataExport={...this.lease};return program;}
 read(client:NativeGpuClient,ticket:NativeFrameTicket,id:string,options:{signal?:AbortSignal}={}):Promise<NativeBufferValue>{
  if(this.closed||this.closing)return Promise.reject(new EngineError('E_NATIVE_DATA_CLOSED','Buffer exporter is closed'));
  const task=this.readOwned(client,ticket,id,options);this.active.add(task);void task.finally(()=>this.active.delete(task)).catch(()=>{});return task;
 }
 private async readOwned(client:NativeGpuClient,ticket:NativeFrameTicket,id:string,options:{signal?:AbortSignal}):Promise<NativeBufferValue>{
  const check=()=>{if(this.closed)throw new EngineError('E_NATIVE_DATA_CLOSED','Buffer exporter is closed');if(options.signal?.aborted)throw new EngineError('E_RENDER_CANCELLED','Explicit buffer export cancelled');};check();
  if(client.program.dataExport?.directory!==this.lease.directory)throw new EngineError('E_NATIVE_DATA_PERMISSION','Export lease does not belong to this owner');
  const out=client.program.bufferOutputs?.find(o=>o.id===id);if(!out)throw new EngineError('E_NATIVE_DATA_OUTPUT','No named buffer publication: '+id);
  const {kind,version,length,byteLength,readOnly,...descriptor}=out.info;if(kind!=='data'||version!==1)throw new EngineError('E_NATIVE_DATA_OUTPUT','Expected data contract v1');const checked=fieldInfo(descriptor);if(checked.length!==length||checked.byteLength!==byteLength)throw new EngineError('E_NATIVE_DATA_OUTPUT','Buffer metadata length mismatch');
  const file=randomBytes(24).toString('hex')+'.f32',path=join(this.lease.directory,file);
  try{const reply=await client.exportBuffer(ticket,id,file);check();const bytes=await readFile(path);if(reply.version!==1||reply.bytes!==byteLength||bytes.length!==byteLength)throw new EngineError('E_NATIVE_DATA_BYTES','Export byte length mismatch');
   const Type=checked.type==='f32'?Float32Array:checked.type==='u32'?Uint32Array:Int32Array;
   // Never expose pooled Buffer neighbours. Large readFile allocations can be
   // adopted directly; small/unaligned slices receive one native byte copy.
   const owned=bytes.byteOffset===0&&bytes.buffer.byteLength===byteLength?bytes:new Uint8Array(bytes);
   const values=endianness()==='LE'?new Type(owned.buffer as ArrayBuffer,owned.byteOffset,length):new Type(length);
   if(endianness()!=='LE')for(let i=0;i<length;i++)values[i]=checked.type==='f32'?bytes.readFloatLE(i*4):checked.type==='u32'?bytes.readUInt32LE(i*4):bytes.readInt32LE(i*4);
   return {version:1,frame:ticket.frame,publication:ticket.publication!,info:{...checked,...readOnly?{readOnly}:{}},values};
  }catch(error){if(!client.connected())await client.exited;throw error;}finally{await unlink(path).catch((e:NodeJS.ErrnoException)=>{if(e.code!=='ENOENT')throw e;});}
 }
 close():Promise<void>{return this.closing??=(async()=>{await Promise.allSettled([...this.active]);this.closed=true;await rmdir(this.lease.directory);})();}
}
export function exportedPositions(value:NativeBufferValue):[number,number,number][]{
 if(value.info.type!=='f32'||value.info.semantic!=='position'||value.info.components!==3||value.values.length%3)throw new EngineError('E_NATIVE_DATA_TYPE','Expected a published f32 XYZ position field');
 const out:[number,number,number][]=[];for(let i=0;i<value.values.length;i+=3){const p:[number,number,number]=[value.values[i],value.values[i+1],value.values[i+2]];if(p.some(n=>!Number.isFinite(n)||Math.abs(n)>1e30))throw new EngineError('E_NATIVE_DATA_RANGE','Invalid exported position');out.push(p);}return out;
}
