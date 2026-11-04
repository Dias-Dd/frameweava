import type {Json} from '../../src/core/types.ts';

export type GpuWordType='f32'|'u32'|'i32';
export type GpuWords=Float32Array|Uint32Array|Int32Array;
export type GpuSize3=readonly [number,number,number];
export type GpuFieldSemantic='generic'|'depth'|'normal'|'motion'|'density'|'position'|'velocity'|'coverage'|'validity'|'indices';
export interface GpuBufferDescriptor {type:GpuWordType;length:number;label?:string}
/** GPU storage layout only, not a new Graphics document or TVG port schema.
 * X is contiguous, then Y, then Z; components are interleaved. No Color/Alpha. */
export interface GpuFieldDescriptor {
 type:GpuWordType;dimensions:GpuSize3;components:1|2|3|4;semantic:GpuFieldSemantic;
 /** Global integer center of this resident tile; default [0,0,0]. */
 origin?:GpuSize3;domain?:GpuSize3;space?:string;units?:string;channels?:readonly string[];metadata?:Json;label?:string;
}
export interface GpuDataInfo {
 readonly readOnly?:true;
 readonly kind:'data';readonly version:1;readonly type:GpuWordType;readonly length:number;readonly byteLength:number;
 readonly dimensions:GpuSize3;readonly components:1|2|3|4;readonly origin:GpuSize3;readonly domain:GpuSize3;
 readonly semantic:GpuFieldSemantic;readonly space?:string;readonly units?:string;readonly channels?:readonly string[];readonly metadata?:Json;readonly label?:string;
}
declare const dataBrand:unique symbol,computeBrand:unique symbol;
export interface GpuDataBuffer {readonly [dataBrand]:true;readonly info:GpuDataInfo;readonly toJSON:()=>never}
export interface GpuComputeBinding {type:GpuWordType;access:'read'|'read_write';atomic?:boolean}
export interface GpuComputeKernelSource {
 abiVersion:1;id:string;version:string;bindings:readonly GpuComputeBinding[];parameterWords:number;
 workgroupSize:GpuSize3;
 /** workgroup mode invokes all lanes, including tails, to permit uniform barriers. */
 mode?:'element'|'workgroup';
 /** fn compute(global:vec3u,local:vec3u,group:vec3u). No binding/entry attributes. */
 code:string;
}
export interface GpuComputeKernel {readonly [computeBrand]:true;readonly info:Readonly<Omit<GpuComputeKernelSource,'code'>&{sha256:string}>;readonly toJSON:()=>never}
export interface GpuDispatchOptions {
 workItems:GpuSize3;origin?:GpuSize3;domain?:GpuSize3;
 parameters?:Float32Array|Uint32Array;signal?:AbortSignal;
}
export interface GpuBufferRange {offset?:number;length?:number;signal?:AbortSignal}
export interface GpuComputeScopeApi {
 /** Optional, capability-gated read-only geometry cache; ordinary buffers remain frame-local. */
 createResidentBuffer?(descriptor:GpuBufferDescriptor,values:GpuWords):Promise<GpuDataBuffer>;
 createResidentField?(descriptor:GpuFieldDescriptor,values:GpuWords):Promise<GpuDataBuffer>;
 replaceResidentBuffer?(buffer:GpuDataBuffer,values:GpuWords):Promise<GpuDataBuffer>;
 createBuffer(descriptor:GpuBufferDescriptor,data?:GpuWords):Promise<GpuDataBuffer>;
 createField(descriptor:GpuFieldDescriptor,data?:GpuWords):Promise<GpuDataBuffer>;
 writeBuffer(buffer:GpuDataBuffer,data:GpuWords,offset?:number):Promise<void>;
 clearBuffer(buffer:GpuDataBuffer,range?:GpuBufferRange):Promise<void>;
 copyBuffer(source:GpuDataBuffer,target:GpuDataBuffer,range?:{sourceOffset?:number;targetOffset?:number;length?:number}):Promise<void>;
 cloneBuffer(source:GpuDataBuffer):Promise<GpuDataBuffer>;
 readBuffer(buffer:GpuDataBuffer,range?:GpuBufferRange):Promise<GpuWords>;
 releaseBuffer(buffer:GpuDataBuffer):Promise<void>;
 compileCompute(source:GpuComputeKernelSource):Promise<GpuComputeKernel>;
 dispatch(kernel:GpuComputeKernel,buffers:readonly GpuDataBuffer[],options:GpuDispatchOptions):Promise<void>;
}
