import {EngineError} from '../../src/core/errors.ts';
import type {GpuBufferDescriptor,GpuFieldDescriptor,GpuDataInfo,GpuWords,GpuWordType,GpuSize3,GpuComputeKernelSource,GpuDispatchOptions} from './compute-types.ts';
export function computeFail(code:string,message:string,details?:unknown):never{throw new EngineError(code,message,{details});}
export function computeFields(v:unknown,allowed:string[]){if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!allowed.includes(k)))computeFail('E_GPU_COMPUTE_CONTRACT','Unknown or malformed compute field');}
export function computeAbort(signal?:AbortSignal){if(signal!==undefined&&!(signal instanceof AbortSignal))computeFail('E_GPU_COMPUTE_CONTRACT','Expected a local AbortSignal');if(signal?.aborted)computeFail('E_RENDER_CANCELLED','GPU compute cancelled');}
export function size3(v:GpuSize3,name:string,zero=false):GpuSize3{
 if(!Array.isArray(v)||v.length!==3||v.some(n=>!Number.isSafeInteger(n)||n<(zero?0:1)||n>0x7fffffff))computeFail('E_GPU_COMPUTE_CONTRACT','Invalid '+name);
 return Object.freeze([...v]) as unknown as GpuSize3;
}
function type(v:GpuWordType){if(!['f32','u32','i32'].includes(v))computeFail('E_GPU_BUFFER_TYPE','Only explicit f32/u32/i32 storage is supported');return v;}
function text(v:string|undefined,name:string){if(v!==undefined&&(typeof v!=='string'||!v.length))computeFail('E_GPU_COMPUTE_CONTRACT','Invalid '+name);return v;}
function frozenJson(v:unknown):any{
 const pending:{value:unknown;exit?:boolean}[]=[{value:v}],ancestors=new Set<object>();
 while(pending.length){const {value,exit}=pending.pop()!;if(exit){ancestors.delete(value as object);continue;}
  if(value===null||typeof value==='string'||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))continue;
  if(!value||typeof value!=='object')return computeFail('E_GPU_COMPUTE_CONTRACT','Metadata must be finite JSON');
  if(!Array.isArray(value)&&Object.getPrototypeOf(value)!==Object.prototype||ancestors.has(value))computeFail('E_GPU_COMPUTE_CONTRACT','Metadata must be plain acyclic JSON');
  ancestors.add(value);pending.push({value,exit:true});for(const x of Object.values(value))pending.push({value:x});
 }
 try{const copy=JSON.parse(JSON.stringify(v)),stack=[copy];while(stack.length){const x=stack.pop();if(x&&typeof x==='object'){for(const child of Object.values(x))stack.push(child);Object.freeze(x);}}return copy;}catch(error){return computeFail('E_GPU_COMPUTE_CONTRACT','Metadata serialization failed',{cause:String(error)});}
}
export function fieldInfo(d:GpuFieldDescriptor):GpuDataInfo {
 computeFields(d,['type','dimensions','components','semantic','origin','domain','space','units','channels','metadata','label']);type(d.type);
 const dimensions=size3(d.dimensions,'field dimensions'),origin=size3(d.origin??[0,0,0],'field origin',true),domain=size3(d.domain??dimensions,'field domain');
 if(![1,2,3,4].includes(d.components)||origin.some((v,i)=>v+dimensions[i]>domain[i]))computeFail('E_GPU_COMPUTE_CONTRACT','Field components/origin/domain disagree');
 const n=dimensions.reduce((a,b)=>a*b,1)*d.components;if(!Number.isSafeInteger(n)||n<1||n>0x3fffffff)computeFail('E_GPU_BUFFER_LIMIT','Field byte size exceeds supported limits');
 const semantics={generic:[1,2,3,4],depth:[1],normal:[3],motion:[2,3],density:[1],position:[2,3,4],velocity:[2,3,4],coverage:[1],validity:[1],indices:[1,2,3,4]};
 if(!Object.hasOwn(semantics,d.semantic)||!semantics[d.semantic].includes(d.components))computeFail('E_GPU_COMPUTE_CONTRACT','Semantic/channel count mismatch');
 if(['depth','normal','motion','position','velocity'].includes(d.semantic)&&(!d.space||!d.units))computeFail('E_GPU_COMPUTE_CONTRACT','Spatial fields require explicit space and units');
 if(d.channels!==undefined&&(!Array.isArray(d.channels)||d.channels.length!==d.components||d.channels.some(s=>typeof s!=='string'||!s.length)))computeFail('E_GPU_COMPUTE_CONTRACT','Field channels must name each component');
 const info={kind:'data' as const,version:1 as const,type:d.type,length:n,byteLength:n*4,dimensions,origin,domain,components:d.components,semantic:d.semantic,...d.space!==undefined?{space:text(d.space,'space')}:{},...d.units!==undefined?{units:text(d.units,'units')}:{},...d.channels?{channels:Object.freeze([...d.channels])}:{},...d.metadata!==undefined?{metadata:frozenJson(d.metadata)}:{},...d.label!==undefined?{label:text(d.label,'label')}:{}};
 return Object.freeze(info);
}
export function bufferInfo(d:GpuBufferDescriptor):GpuDataInfo {computeFields(d,['type','length','label']);return fieldInfo({type:d.type,dimensions:[d.length,1,1],components:1,semantic:'generic',...d.label!==undefined?{label:d.label}:{}});}
export function wordsType(data:GpuWords):GpuWordType {if(data instanceof Float32Array)return 'f32';if(data instanceof Uint32Array)return 'u32';if(data instanceof Int32Array)return 'i32';return computeFail('E_GPU_BUFFER_TYPE','Expected an owned 32-bit typed array');}
export function checkWords(info:GpuDataInfo,data:GpuWords,offset=0){
 if(wordsType(data)!==info.type||!(data.buffer instanceof ArrayBuffer))computeFail('E_GPU_BUFFER_TYPE','Typed array does not match the declared storage type');
 if(!Number.isSafeInteger(offset)||offset<0||offset+data.length>info.length)computeFail('E_GPU_BUFFER_RANGE','Write exceeds buffer');
 if(info.type==='f32')for(const v of data)if(!Number.isFinite(v))computeFail('E_GPU_BUFFER_RANGE','Nonfinite field input');
}
export function bufferRange(info:GpuDataInfo,offset=0,length=info.length-offset){if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(length)||offset<0||length<1||offset+length>info.length)computeFail('E_GPU_BUFFER_RANGE','Invalid buffer word range');return {offset,length};}
export function computeSource(s:GpuComputeKernelSource,native=false):GpuComputeKernelSource{
 computeFields(s,['abiVersion','id','version','bindings','parameterWords','workgroupSize','mode','code']);
 if(s.abiVersion!==1||typeof s.id!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,127}$/.test(s.id)||typeof s.version!=='string'||!/^\d+\.\d+\.\d+$/.test(s.version))computeFail('E_GPU_COMPUTE_CONTRACT','Explicit compute ABI/id/version required');
 if(!Array.isArray(s.bindings)||s.bindings.length<1||!s.bindings.some(b=>b.access==='read_write'))computeFail('E_GPU_COMPUTE_CONTRACT','Compute requires declared buffers and at least one writable buffer; device binding limits apply');
 const bindings=s.bindings.map(b=>{computeFields(b,['type','access','atomic']);type(b.type);if(!['read','read_write'].includes(b.access)||b.atomic!==undefined&&typeof b.atomic!=='boolean'||b.atomic&&(b.type==='f32'||b.access!=='read_write'))computeFail('E_GPU_COMPUTE_CONTRACT','Invalid storage access/atomic type');return Object.freeze({type:b.type,access:b.access,atomic:b.atomic===true});});
 if(!Number.isInteger(s.parameterWords)||s.parameterWords<0||s.parameterWords>0xffffffff||s.mode!==undefined&&!['element','workgroup'].includes(s.mode)||typeof s.code!=='string'||!s.code.trim()||/@|\b(enable|requires|diagnostic)\b|\bfw_\w*/.test(s.code))computeFail('E_GPU_COMPUTE_CONTRACT','Invalid compute body/parameters/mode');
 return Object.freeze({abiVersion:1,id:s.id,version:s.version,bindings:Object.freeze(bindings),parameterWords:s.parameterWords,workgroupSize:size3(s.workgroupSize,'workgroup size'),mode:s.mode??'element',code:s.code});
}
export function dispatchPlan(o:GpuDispatchOptions,group:GpuSize3,limits:{maxComputeWorkgroupsPerDimension:number}){
 computeFields(o,['workItems','origin','domain','parameters','signal']);computeAbort(o.signal);const workItems=size3(o.workItems,'dispatch workItems'),origin=size3(o.origin??[0,0,0],'dispatch origin',true),domain=size3(o.domain??workItems,'dispatch domain');
 if(origin.some((v,i)=>v+workItems[i]>domain[i]))computeFail('E_GPU_COMPUTE_CONTRACT','Dispatch exceeds domain');const groups=workItems.map((n,i)=>Math.ceil(n/group[i]));if(groups.some(n=>n>limits.maxComputeWorkgroupsPerDimension))computeFail('E_GPU_COMPUTE_LIMIT','Dispatch exceeds workgroup limit; tile explicitly');return {workItems,origin,domain,groups};
}
