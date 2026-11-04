import {computeSource} from './compute-contract.ts';
import {dataShaderHelpers} from './data-shader.ts';
import type {GpuComputeKernelSource} from './compute-types.ts';

export const computeHeaderVectors=(bindings:number)=>4+3*bindings;
export function computeShader(input:GpuComputeKernelSource){
 return buildComputeShader(input,true);
}
export function nativeComputeShader(input:GpuComputeKernelSource){return buildComputeShader(input,false);}
function buildComputeShader(input:GpuComputeKernelSource,checked:boolean){
 const s=computeSource(input,!checked),n=s.bindings.length;
 const variables=s.bindings.map((b,i)=>`@group(0) @binding(${i}) var<storage,${b.access}> fw_buffer${i}:array<${b.atomic?`atomic<${b.type}>`:'u32'}>;`).join('\n');
 return `${variables}
 struct FwComputeMeta{header:array<vec4u,${computeHeaderVectors(n)}>,params:array<vec4u,${Math.max(1,Math.ceil(s.parameterWords/4))}>}
 ${checked?'@group(0) @binding('+n+') var<storage,read_write> fw_errors:array<atomic<u32>>;':''}
 @group(0) @binding(${n+(checked?1:0)}) var<uniform> fw_meta:FwComputeMeta;
 fn workItems()->vec3u{return fw_meta.header[0].xyz;}
 fn dispatchOrigin()->vec3u{return fw_meta.header[1].xyz;}
 fn domainSize()->vec3u{return fw_meta.header[2].xyz;}
 fn paramU32(i:u32)->u32{return fw_meta.params[i/4u][i%4u];}
 fn paramF32(i:u32)->f32{return bitcast<f32>(paramU32(i));}
 ${dataShaderHelpers(s.bindings,{header:'fw_meta.header',metaBase:4,status:'fw_errors',slot:'fw_meta.header[1].w',prefix:'fw_buffer',linearPrefix:'load',checked})}
 ${s.code}
 @compute @workgroup_size(${s.workgroupSize.join(',')}) fn fw_main(@builtin(global_invocation_id) id:vec3u,@builtin(local_invocation_id) local:vec3u,@builtin(workgroup_id) group:vec3u){
 ${s.mode==='element'?'if(any(id>=workItems())){return;}':''}
 compute(id+dispatchOrigin(),local,group);
 }`;
}
