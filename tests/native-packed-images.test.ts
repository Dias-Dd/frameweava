import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {resolve} from 'node:path';
import {NativeGpuClient,type NativeProgram} from '../modules/native-gpu/client.ts';
import {residentLayout} from '../modules/native-gpu/memory.ts';
import {packNativeF16Intermediates} from '../modules/native-gpu/packed-images.ts';
import {NativeRecordingScope} from '../modules/native-gpu/scope.ts';
import {linear709,fromHalf,toHalf} from '../src/media/surface.ts';

const executable=resolve(process.env.FRAMEWEAVE_NATIVE_GPU??'.frameweave/native-target/debug/frameweave-native-gpu.exe');
const output={width:8,height:1,color:linear709,alpha:'straight'} as const;

test('packed native intermediates preserve half ties, HDR, negative RGB, alpha and nonfinite behavior',async()=>{
 const scope=new NativeRecordingScope(),gpu=scope.api;
 const source=await gpu.compile({abiVersion:1,id:'test/packed/source',version:'1.0.0',inputCount:0,parameterWords:0,
  code:`fn pixel(p:vec2u)->vec4f{
   let bits=array<u32,8>(0x3f801000u,0x3f803000u,0x33800000u,0xb3800000u,0x477fe000u,0x477ff000u,0xff800000u,0x7fc00000u);
   return vec4f(bitcast<f32>(bits[p.x]),-.125,4.,.625);
  }`});
 const read=await gpu.compile({abiVersion:1,id:'test/packed/read',version:'1.0.0',inputCount:1,parameterWords:0,
  code:`fn pixel(p:vec2u)->vec4f{
   let v=read0(vec2i(p));let bits=bitcast<u32>(v.r);
   if(p.x>=5u){return vec4f(f32((bits>>31u)&1u),f32((bits>>23u)&255u),f32((bits>>22u)&1u),v.a);}
   return v;
  }`});
 const first=await gpu.run(source,[],{output:{...output,format:'rgba16float'}});
 scope.publish(await gpu.run(read,[first],{output:{...output,format:'rgba32float'}}));
 const {parameters,output:index,external:_e,kernelOffset:_k,...p}=scope.packet();
 const wide:NativeProgram={...p,version:2,session:randomBytes(32).toString('hex'),slots:1,maxBytes:2**20,display:null};
 const packed=structuredClone(wide);
 assert.equal(packNativeF16Intermediates(packed,index),true);
 assert.equal(packNativeF16Intermediates(packed,index),false);
 assert.equal(residentLayout(wide).bytes,256);
 assert.equal(residentLayout(packed).bytes,192);
 assert.equal(packed.images[index].storage,undefined);
 const disallowed=structuredClone(wide);
 disallowed.data=[{type:'f32',length:32,initial:[],sourceImage:0}];
 assert.equal(packNativeF16Intermediates(disallowed,index),false);
 const expected=[1+2**-11,1+3*2**-11,2**-24,-(2**-24),65504].flatMap(v=>[fromHalf(toHalf(v)),-.125,4,.625]);
 expected.push(0,255,0,.625,1,255,0,.625,0,255,1,.625);
 try{
  for(const program of [wide,packed]){
   program.imageAllocations=residentLayout(program).mapping;
   const client=await NativeGpuClient.create(program,{executable});
   try {
    const frame=await client.submit(0,parameters);await frame.completed;
    assert.deepEqual((await client.inspectForTest(frame.slot,index)).pixels,expected);
    assert.deepEqual((await client.inspectForTest(frame.slot,0)).pixels.slice(0,20),expected.slice(0,20));
    const stats=await client.stats();
    assert.equal(stats.allocatedImageBytes,program===wide?256:192);
    assert.equal(stats.diagnosticReadbackBytes,program===wide?256:192);
    assert.equal(stats.numericalValidationPasses,0);
   }finally{await client.close();}
  }
 }finally{await scope.api.dispose();}
});
