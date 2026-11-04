import test from 'node:test';
import assert from 'node:assert/strict';
import {NativeRecordingScope} from '../modules/native-gpu/scope.ts';
import {borrowNativeScope} from '../modules/native-gpu/borrow.ts';
import {registerNativeScope} from '../modules/native-gpu/provenance.ts';
import {EngineError} from '../src/core/errors.ts';
import {linear709} from '../src/media/surface.ts';

// Recording-only unit fixture. This does not claim hardware admission, physical
// GPU memory measurements or a heap profile; it exercises the real epoch/token
// checks and lease ownership without creating a device or loading Servo.
function fixture(){const recorder=new NativeRecordingScope(),owner=recorder.api;registerNativeScope(owner,{version:1,backend:'native-wgpu',owner:'a'.repeat(64),hardwareVerified:true,capabilities:{...owner.capabilities(),hardwareVerified:true}});return {recorder,owner};}
const source={abiVersion:1 as const,id:'test/borrow/lifetime',version:'1.0.0',inputCount:0,parameterWords:0,code:'fn pixel(p:vec2u)->vec4f{return vec4f(4.,-1.,2.,.5);}'};
const output={width:1,height:1,format:'rgba32float' as const,alpha:'premultiplied' as const,color:linear709};

test('owned expired images, buffers and modules are forgotten after the first release error',async()=>{
 const {recorder,owner}=fixture(),calls={image:0,buffer:0,module:0},release=owner.release.bind(owner),releaseBuffer=owner.releaseBuffer.bind(owner),releaseModule=owner.releaseModule.bind(owner);
 owner.release=async value=>{calls.image++;await release(value);};owner.releaseBuffer=async value=>{calls.buffer++;await releaseBuffer(value);};owner.releaseModule=async value=>{calls.module++;await releaseModule(value);};
 const lease=borrowNativeScope(owner),g=lease.scope,k=await g.compile(source),m=await g.createModule({version:1,id:'frameweave.servo',moduleVersion:'0.1.0',profile:'sdr-srgb8',execution:'trusted-local',width:1,height:1,input:false,html:'<p>unit</p>'});recorder.sealInitialization();
 try{
  for(let frame=0;frame<128;frame++){
   recorder.beginFrame();const image=await g.run(k,[],{output}),buffer=await g.createBuffer({type:'f32',length:1},Float32Array.of(frame));recorder.beginFrame();
   await assert.rejects(g.release(image),{code:'E_NATIVE_SCOPE'});await assert.rejects(g.release(image),{code:'E_NATIVE_RESOURCE_OWNER'});
   await assert.rejects(g.releaseBuffer(buffer),{code:'E_NATIVE_SCOPE'});await assert.rejects(g.releaseBuffer(buffer),{code:'E_NATIVE_RESOURCE_OWNER'});
  }
  await owner.releaseModule(m);await assert.rejects(g.releaseModule(m),{code:'E_NATIVE_SCOPE'});await assert.rejects(g.releaseModule(m),{code:'E_NATIVE_RESOURCE_OWNER'});
  const live=await g.run(k,[],{output});await lease.dispose();await lease.dispose();assert.deepEqual(calls,{image:129,buffer:128,module:2});assert.equal(owner.stats().disposed,false);await assert.rejects(owner.release(live),{code:'E_NATIVE_SCOPE'});
  // Disposing the borrowed lease did not dispose the Stage owner.
  const stillLive=await owner.run(k,[],{output});await owner.release(stillLive);
 }finally{await lease.dispose();await owner.dispose();}
});

test('foreign releases never reach the owner; other errors retain ownership and propagate unchanged',async()=>{
 const {owner}=fixture(),base=owner.release.bind(owner),primary=new EngineError('E_TEST_RELEASE','retryable release failure');let attempts=0,fail=true;
 owner.release=async value=>{attempts++;if(fail){fail=false;throw primary;}await base(value);};const lease=borrowNativeScope(owner),k=await owner.compile(source),foreign=await owner.run(k,[],{output}),owned=await lease.scope.run(k,[],{output});
 try{await assert.rejects(lease.scope.release(foreign),{code:'E_NATIVE_RESOURCE_OWNER'});assert.equal(attempts,0);await assert.rejects(lease.scope.release(owned),e=>e===primary);assert.equal(attempts,1);await lease.scope.release(owned);assert.equal(attempts,2);await assert.rejects(lease.scope.release(owned),{code:'E_NATIVE_RESOURCE_OWNER'});await lease.dispose();assert.equal(attempts,2);await owner.release(foreign);assert.equal(owner.stats().disposed,false);}finally{await lease.dispose();await owner.dispose();}
});
