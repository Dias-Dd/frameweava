import assert from 'node:assert/strict';
import {resolve,join} from 'node:path';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {NativeGpuClient,type NativeProgram} from '../../native-gpu/client.ts';
import {nativeExecutable} from '../../native-gpu/executable.ts';
import {NativeRecordingScope} from '../../native-gpu/scope.ts';
import {linear709} from '../../../src/media/surface.ts';
import type {FrameContext} from '../../../src/core/types.ts';
const executable=await nativeExecutable(),out=resolve('artifacts/servo-module');await mkdir(out,{recursive:true});
const context:FrameContext={frame:0,globalFrame:0,time:0,globalTime:0,dt:1/24,progress:0,fps:{num:24,den:1},durationInFrames:24,seed:1};
async function plan(module:boolean){
 const s=new NativeRecordingScope();
 if(module){const m=await s.api.createModule({version:1,id:'frameweave.servo',moduleVersion:'0.1.0',profile:'sdr-srgb8',execution:'trusted-local',width:8,height:4,input:false,html:'<div>Reviewed local</div>'});s.publish(await s.api.runModule(m,[],{context}));}
 else{const k=await s.api.compile({abiVersion:1,id:'test/no-servo',version:'1.0.0',inputCount:0,parameterWords:0,code:'fn pixel(p:vec2u)->vec4f{return vec4f(2.,-.25,.5,1.);}'});s.publish(await s.api.run(k,[],{output:{width:8,height:4,format:'rgba32float',alpha:'opaque',color:linear709}}));}
 const {external:_e,kernelOffset:_k,moduleOffset:_m,parameters,output:_o,...packet}=s.packet();const p:NativeProgram={...packet,version:2,session:randomBytes(32).toString('hex'),slots:1,maxBytes:8*1024**2,display:null};return{p,parameters,s};
}
const original=process.env.FRAMEWEAVE_SERVO_RUNTIME,disabled=process.env.FRAMEWEAVE_DISABLE_EXTERNAL_IMAGES,results:unknown[]=[];
try{
 delete process.env.FRAMEWEAVE_SERVO_RUNTIME;
 for(const forceDisabled of [false,true]){
  if(forceDisabled)process.env.FRAMEWEAVE_DISABLE_EXTERNAL_IMAGES='1';else delete process.env.FRAMEWEAVE_DISABLE_EXTERNAL_IMAGES;
  const {p,parameters,s}=await plan(false),client=await NativeGpuClient.create(p,{executable});
  try{const ticket=await client.submit(0,parameters);await ticket.completed;const stats=await client.stats();assert.equal(stats.nativeModules.loaded,false);assert.equal(stats.nativeModules.runtimeFileHashes,0);assert.equal(stats.nativeModules.additionalD3D11Devices,0);if(forceDisabled)assert.equal(stats.externalImages.enabled,false);results.push({case:'pure-native',forceDisabled,stats});}finally{await client.close();await s.api.dispose();}
 }
 const unavailable=await plan(true);await assert.rejects(NativeGpuClient.create(unavailable.p,{executable}),{code:'E_NATIVE_MODULE_UNAVAILABLE'});results.push({case:'explicitly-disabled-servo',error:'E_NATIVE_MODULE_UNAVAILABLE'});await unavailable.s.api.dispose();
 delete process.env.FRAMEWEAVE_DISABLE_EXTERNAL_IMAGES;
 if(existsSync(resolve('native-bin/win32-x64/servo/servo-runtime.json'))){
  const {p,parameters,s}=await plan(true),client=await NativeGpuClient.create(p,{executable});
  try{
   const ticket=await client.submit(0,parameters);await ticket.completed;
   const stats=await client.stats();
   assert.equal(stats.nativeModules.loaded,true);
   assert.equal(stats.nativeModules.runtimeFileHashes,5);
   assert.equal(process.env.FRAMEWEAVE_SERVO_RUNTIME,undefined);
   results.push({case:'automatic-runtime',stats});
  }finally{await client.close();await s.api.dispose();}
 }else results.push({case:'automatic-runtime',skipped:'Installed Servo bundle unavailable'});
 const bad=await mkdtemp(join(out,'changed-runtime-'));
 process.env.FRAMEWEAVE_SERVO_RUNTIME=join(bad,'missing');
 const missing=await plan(true);await assert.rejects(NativeGpuClient.create(missing.p,{executable}),{code:'E_NATIVE_MODULE_MISSING'});results.push({case:'missing-runtime-override',error:'E_NATIVE_MODULE_MISSING'});await missing.s.api.dispose();
 const files=Object.fromEntries(['frameweave_servo.dll','frameweave_servo_bridge.dll','libEGL.dll','libGLESv2.dll','clock.js'].map(f=>[f,'0'.repeat(64)]));
 await writeFile(join(bad,'servo-runtime.json'),JSON.stringify({version:1,abi:1,trusted_local:true,files}));await writeFile(join(bad,'frameweave_servo.dll'),'changed bytes');process.env.FRAMEWEAVE_SERVO_RUNTIME=bad;
 const changed=await plan(true);await assert.rejects(NativeGpuClient.create(changed.p,{executable}),{code:'E_NATIVE_MODULE_INTEGRITY'});results.push({case:'changed-runtime',error:'E_NATIVE_MODULE_INTEGRITY'});await changed.s.api.dispose();
 await writeFile(join(bad,'undeclared.dll'),'undeclared local dependency');
 const undeclared=await plan(true);await assert.rejects(NativeGpuClient.create(undeclared.p,{executable}),e=>(e as any).code==='E_NATIVE_MODULE_INTEGRITY'&&/undeclared local DLL/.test((e as Error).message));results.push({case:'undeclared-local-DLL',error:'E_NATIVE_MODULE_INTEGRITY'});await undeclared.s.api.dispose();
 await writeFile(join(out,'admission.json'),JSON.stringify({version:1,ok:true,results},null,2)+'\n');console.log(JSON.stringify({ok:true,results}));
}finally{if(original===undefined)delete process.env.FRAMEWEAVE_SERVO_RUNTIME;else process.env.FRAMEWEAVE_SERVO_RUNTIME=original;if(disabled===undefined)delete process.env.FRAMEWEAVE_DISABLE_EXTERNAL_IMAGES;else process.env.FRAMEWEAVE_DISABLE_EXTERNAL_IMAGES=disabled;}
