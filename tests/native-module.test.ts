import test from 'node:test';
import assert from 'node:assert/strict';
import {NativeRecordingScope} from '../modules/native-gpu/scope.ts';
import {nativeModuleSource,nativeModuleParameters,type NativeModuleSource} from '../modules/native-gpu/module.ts';
import {borrowNativeScope} from '../modules/native-gpu/borrow.ts';
import {registerNativeScope} from '../modules/native-gpu/provenance.ts';
import {createServo} from '../modules/servo/index.ts';
import {linear709,acescg} from '../src/media/surface.ts';
import type {FrameContext} from '../src/core/types.ts';
const spec:NativeModuleSource={version:1,id:'frameweave.servo',moduleVersion:'0.1.0',profile:'sdr-srgb8',execution:'trusted-local',width:8,height:4,input:false,html:'<div>Local</div>'};
const context:FrameContext={frame:.5,globalFrame:1,time:1/48,globalTime:1/24,dt:1/24,progress:0,fps:{num:24,den:1},durationInFrames:24,seed:0};

test('native module admission has one fixed implementation, explicit precision and reviewed-local execution',()=>{
 assert.deepEqual(nativeModuleSource(spec),spec);
 for(const invalid of [{id:'other'},{moduleVersion:'2.0.0'},{profile:'hdr-lossless'},{execution:'untrusted'},{width:0},{timeoutMs:0},{dll:'unreviewed.dll'},{handle:123}])assert.throws(()=>nativeModuleSource({...spec,...invalid} as any),{code:'E_NATIVE_MODULE'});
});
test('control transport preserves fractional Stage frames, finite f64 time and nested parameter values',()=>{
 const words=nativeModuleParameters({context,parameters:{text:'你好',points:[{x:1,y:2}]}});assert.equal(words.length,1024);
 const bytes=Buffer.alloc(4092);words.slice(1).forEach((v,i)=>bytes.writeUInt32LE(v,i*4));assert.deepEqual(JSON.parse(bytes.subarray(0,words[0]).toString()),{context,parameters:{text:'你好',points:[{x:1,y:2}]}});
 for(const parameters of [{a:NaN},{a:()=>0},{a:new Uint8Array(2)},{a:Infinity}])assert.throws(()=>nativeModuleParameters({context,parameters}),{code:'E_NATIVE_MODULE'});
});
test('module definitions are initialized once and emitted as ordered deltas, while frame controls remain separate',async()=>{
 const s=new NativeRecordingScope(),m=await s.api.createModule(spec);s.sealInitialization();
 for(const [n,frame]of [0,3,0].entries()){
  s.beginFrame();const image=await s.api.runModule(m,[],{context:{...context,frame,globalFrame:frame,time:frame/24}});s.publish(image);const p=s.packet();
  assert.equal(p.modules?.length,n?0:1);assert.equal(p.moduleOffset,n?1:0);assert.equal(p.passes[0].module,0);assert.equal(p.parameters[0].length,1024);assert.equal(image.info.format,'rgba32float');assert.equal(image.info.alpha,'premultiplied');
 }
 await s.api.releaseModule(m);await assert.rejects(s.api.runModule(m,[],{context}),{code:'E_NATIVE_SCOPE'});await s.api.dispose();
});
test('Servo input boundary rejects implicit gamut/size changes and owner-local image forgery',async()=>{
 const s=new NativeRecordingScope(),m=await s.api.createModule({...spec,input:true}),k=await s.api.compile({abiVersion:1,id:'test/servo-owner',version:'1.0.0',inputCount:0,parameterWords:0,code:'fn pixel(p:vec2u)->vec4f{return vec4f(0.);}'});
 const image=await s.api.run(k,[],{output:{width:8,height:4,color:acescg,format:'rgba32float',alpha:'straight'}});
 await assert.rejects(s.api.runModule(m,[image],{context}),/convert upstream explicitly/);
 await assert.rejects(s.api.runModule(m,[{info:{...image.info,color:linear709}} as any],{context}),{code:'E_NATIVE_SCOPE'});await s.api.dispose();
});
test('a borrowed module lease cannot release another owner module, and helper disposal is idempotent',async()=>{
 const s=new NativeRecordingScope();registerNativeScope(s.api,{version:1,backend:'native-wgpu',owner:'a'.repeat(64),hardwareVerified:true,capabilities:{...s.api.capabilities(),hardwareVerified:true}});
 const other=await s.api.createModule(spec),borrowed=borrowNativeScope(s.api);
 await assert.rejects(borrowed.scope.releaseModule(other),{code:'E_NATIVE_RESOURCE_OWNER'});
 const {version:_v,id:_id,moduleVersion:_mv,...options}=spec,effect=await createServo(borrowed.scope,options);
 await effect.dispose();await effect.dispose();await borrowed.dispose();await s.api.releaseModule(other);await s.api.dispose();
});
