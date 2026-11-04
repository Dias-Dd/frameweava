import test from 'node:test';
import assert from 'node:assert/strict';
import {bufferInfo,fieldInfo,checkWords,computeSource,dispatchPlan} from '../modules/gpu-effects/compute-contract.ts';
import {computeShader} from '../modules/gpu-effects/compute-shader.ts';
import {pixelShader,validatePixelKernel} from '../modules/gpu-effects/pixel-shader.ts';
import type {GpuComputeKernelSource} from '../modules/gpu-effects/compute-types.ts';
const source:GpuComputeKernelSource={abiVersion:1,id:'test/compute',version:'1.0.0',bindings:[{type:'f32',access:'read_write'}],parameterWords:0,workgroupSize:[64,1,1],code:'fn compute(id:vec3u,local:vec3u,group:vec3u){store0(id.x,1.);}'};
test('typed data layouts are finite non-color storage, with explicit spatial units and halo origin',()=>{
 const f=fieldInfo({type:'f32',dimensions:[3,2,4],components:3,semantic:'normal',space:'world-rh',units:'unit-vector',origin:[2,1,0],domain:[7,6,5]});assert.equal(f.byteLength,288);assert.equal('color' in f,false);assert.equal('alpha' in f,false);assert.ok(Object.isFrozen(f.origin));
 assert.throws(()=>fieldInfo({...f,color:{}} as any));assert.throws(()=>fieldInfo({type:'f32',dimensions:[1,1,1],components:1,semantic:'depth'}));assert.throws(()=>fieldInfo({type:'f32',dimensions:[3,2,4],components:1,semantic:'generic',origin:[2,0,0]}));
 assert.throws(()=>checkWords(bufferInfo({type:'f32',length:2}),new Uint32Array(2)),{code:'E_GPU_BUFFER_TYPE'});assert.throws(()=>checkWords(bufferInfo({type:'f32',length:1}),new Float32Array([NaN])),{code:'E_GPU_BUFFER_RANGE'});
 assert.doesNotThrow(()=>checkWords(bufferInfo({type:'f32',length:2}),new Float32Array([-1e5,1e5])));
});
test('compute ABI rejects unsupported accesses/bindings and keeps workgroup barriers possible',()=>{
 for(const patch of [{abiVersion:2},{bindings:[]},{bindings:[{type:'f32',access:'read'}]},{bindings:[{type:'f32',access:'read_write',atomic:true}]},{code:'@compute fn main(){}'},{code:'fn compute(){fw_buffer0[0]=1u;}'}])assert.throws(()=>computeSource({...source,...patch} as any));
 assert.match(computeShader(source),/if\(any\(id>=workItems\(\)\)\)/);assert.doesNotMatch(computeShader({...source,mode:'workgroup'}),/if\(any\(id>=workItems\(\)\)\)/);assert.match(computeShader(source),/storeField0/);
 assert.throws(()=>dispatchPlan({workItems:[1025,1,1]},[1,1,1],{maxComputeWorkgroupsPerDimension:1024}),{code:'E_GPU_COMPUTE_LIMIT'});
});
test('pixel ABI v1 is retained, v2 explicitly binds non-color data, UV sampling is opt-in',()=>{
 const v1={abiVersion:1 as const,id:'test/pixel',version:'1.0.0',inputCount:1,parameterWords:0,code:'fn pixel(p:vec2u)->vec4f{return read0(vec2i(p));}'};
 assert.equal(validatePixelKernel(v1).abiVersion,1);assert.match(pixelShader(v1),/sampleUv0/);assert.match(pixelShader(v1),/uv\*vec2f\(size0\(\)\)-vec2f\(\.5\)/);
 const v2={...v1,abiVersion:2 as const,dataInputs:[{type:'f32' as const}]};assert.match(pixelShader(v2),/field0/);assert.match(pixelShader(v2),/sampleField0/);assert.match(pixelShader(v2),/@binding\(1\) var<storage,read> fw_data0/);
 assert.throws(()=>validatePixelKernel({...v2,dataInputs:[{type:'rgba'}]} as any));
});
