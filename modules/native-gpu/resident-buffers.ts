import type {GpuBufferDescriptor,GpuFieldDescriptor,GpuDataBuffer,GpuWords} from '../gpu-effects/compute-types.ts';
import type {NativeProgram} from './client.ts';
import {EngineError} from '../../src/core/errors.ts';
/** CPU-authored, read-only geometry/data. Mutable GPU history keeps stateStep. */
export interface NativeResidentBufferScope {
 createResidentBuffer(descriptor:GpuBufferDescriptor,values:GpuWords):Promise<GpuDataBuffer>;
 createResidentField(descriptor:GpuFieldDescriptor,values:GpuWords):Promise<GpuDataBuffer>;
 /** Same shape; returns a new immutable lease, retiring the old handle on success. */
 replaceResidentBuffer(buffer:GpuDataBuffer,values:GpuWords):Promise<GpuDataBuffer>;
}
export interface ResidentIdentity {version:1;id:string}
type Data=NonNullable<NativeProgram['data']>[number];
export function restoreResidentSeed(d:Data&{seedOmitted?:boolean},cache:Map<string,Data>):Data {
 const r=d.resident;
 if(!r||r.version!==1||typeof r.id!=='string'||!/^r[1-9][0-9]*$/.test(r.id)||Object.keys(r).some(k=>!['version','id'].includes(k))||!d.immutable||d.persistent||d.sourceResource||d.sourceImage!==undefined)throw new EngineError('E_NATIVE_RESIDENT_PROTOCOL','Invalid read-only resident identity');
 const old=cache.get(r.id);
 if(d.seedOmitted){if(!old||d.initial.length||old.length!==d.length||old.type!==d.type)throw new EngineError('E_NATIVE_RESIDENT_SEED','Unknown or changed resident seed');return old;}
 if(old||d.initial.length!==d.length)throw new EngineError('E_NATIVE_RESIDENT_SEED','Resident identities are immutable and require a complete initial seed');
 const {seedOmitted:_omit,...value}=d;cache.set(r.id,value);return value;
}
export function residentWireProgram(program:NativeProgram,known:ReadonlySet<string>):NativeProgram {
 return {...program,data:program.data?.map(d=>d.resident&&known.has(d.resident.id)?{...d,initial:[]}:d)};
}
