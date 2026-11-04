import test from 'node:test';
import assert from 'node:assert/strict';
import {pixelInfo,pixelShader,validatePixelKernel,samePixelColor} from '../modules/gpu-effects/pixel-shader.ts';
import {acescg,linear709} from '../src/media/surface.ts';
import type {GpuPixelKernelSource} from '../modules/gpu-effects/pixel-types.ts';
const source:GpuPixelKernelSource={abiVersion:1,id:'test/gain',version:'1.0.0',inputCount:1,parameterWords:1,code:'fn pixel(p:vec2u)->vec4f{return read0(vec2i(p))*paramF32(0u);}'};
test('pixel ABI rejects incompatible versions, unbounded bindings, counts and source',()=>{
 for(const patch of [{abiVersion:2},{inputCount:5},{parameterWords:0x100000000},{version:'latest'},{code:'@compute fn main(){}'},{code:'enable f16;'},{code:'fn pixel(p:vec2u)->vec4f{return fw_output[0];}'},{code:''},{unknown:true}])assert.throws(()=>validatePixelKernel({...source,...patch} as any),{code:'E_GPU_PIXEL_CONTRACT'});
});
test('kernel identity snapshot normalizes property order and cannot be mutated',()=>{
 const a=validatePixelKernel(source),b=validatePixelKernel({code:source.code,parameterWords:1,inputCount:1,version:'1.0.0',id:source.id,abiVersion:1});assert.equal(JSON.stringify(a),JSON.stringify(b));assert.ok(Object.isFrozen(a));
});
test('fixed layout includes explicit input bindings, bounds checks and logical publication checks',()=>{
 const code=pixelShader({...source,inputCount:4});assert.match(code,/@binding\(6\) var<storage,read_write> fw_errors/);assert.match(code,/fn read3/);assert.match(code,/if\(id.x>=d.x\|\|id.y>=d.y\)/);assert.match(code,/atomicMin/);assert.match(code,/fw_half\(value.a\)/);assert.doesNotMatch(code,/clamp\(value/);
});
test('image metadata snapshots color and rejects encoded/unsupported image contracts',()=>{
 const color={...acescg},m=pixelInfo({width:3,height:2,format:'rgba16float',alpha:'premultiplied',color});color.referenceWhiteNits=999;assert.equal(m.color.referenceWhiteNits,100);assert.ok(Object.isFrozen(m.color));assert.ok(samePixelColor(m.color,acescg));assert.equal(samePixelColor(m.color,linear709),false);
 for(const patch of [{width:0},{height:2.5},{width:0x100000000,height:1},{format:'rgba8unorm'},{alpha:'unknown'},{color:{...acescg,transfer:'srgb'}}])assert.throws(()=>pixelInfo({...m,...patch} as any));
});

test('source metadata admits larger images and parameter/source sizes; owners apply actual budgets',()=>{assert.equal(pixelInfo({width:8192,height:8192,format:'rgba32float',alpha:'premultiplied',color:acescg}).width,8192);assert.equal(validatePixelKernel({...source,parameterWords:1025}).parameterWords,1025);assert.ok(validatePixelKernel({...source,code:'/*'+'x'.repeat(262145)+'*/'+source.code}).code.length>262144);});
