import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeManagedTimeEffects} from '../modules/pro-animation/src/native-time/managed.ts';
import type {NativeTimeEnvironment} from '../modules/pro-animation/src/native-time/types.ts';
import {methods,options} from '../modules/pro-animation/validation/upstream-scene/settings.ts';
const c={frame:3,time:3/24,globalFrame:3,globalTime:3/24,dt:1/24,fps:{num:24,den:1},durationInFrames:8,progress:3/7,seed:0};
// Protocol-only stub: rejects before GPU work. Hardware/ownership is checked in the real R1 consumer.
const env={gpu:{capabilities:()=>({backend:'native-wgpu',hardwareVerified:true})},width:64,height:32} as NativeTimeEnvironment;
const info={version:1,profile:'native-pixel-prefix-v1',ownership:'stage-local',id:'test',packageRef:'test@1.0.0',module:'source',integrity:'diagnostic-only'} as const;
for(const method of methods)test('managed '+method+' forwards exact context/window options and propagates Core errors',async()=>{
 const sentinel=Object.assign(Error('Core rejection'),{code:'E_NATIVE_TEMPORAL_EPOCH'});let calls=0;
 const token=Object.freeze({opaque:true}),windowOptions={signal:token,parameters:[[1],[2]]};
 const binding={info,window:async(context:unknown,received:typeof windowOptions,consume:unknown)=>{calls++;assert.equal(context,c);assert.equal(received,windowOptions);assert.equal(typeof consume,'function');throw sentinel;}};
 const fx=createNativeManagedTimeEffects(env,binding);await assert.rejects((fx[method] as Function)(options(method,c,'rgba32float'),c,windowOptions),error=>error===sentinel);assert.equal(calls,1);assert.equal(fx.stats().recordings,0);assert.equal(fx.sourceInfo,info);
});
test('managed adapter requires a Stage-local prefix binding and preserves device gate',()=>{
 for(const binding of [null,{info},{info:{...info,ownership:'global'},window:()=>{}}])assert.throws(()=>createNativeManagedTimeEffects(env,binding as never),{code:'E_PA_TIME_BINDING'});
 assert.throws(()=>createNativeManagedTimeEffects({...env,gpu:{capabilities:()=>({backend:'browser'})} as never},{info,window:async()=>{throw Error('unused');}}),{code:'E_PA_TIME_DEVICE'});
});
test('window options default to an empty object; adapter does not own/dispose the binding',async()=>{
 const binding={info,window:async(_c:unknown,o:object)=>{assert.deepEqual(o,{});throw Error('expected');}};
 const fx=createNativeManagedTimeEffects(env,binding);await assert.rejects(fx.retime({},c),/expected/);assert.equal('dispose'in fx,false);assert.equal(fx.stats().completion,'recorded-only');
});

for(const profile of ['declared-input-v1','declared-resource-v1']as const)test(profile+' reuses the same managed adapter without prefix package identity assumptions',async()=>{const info={version:1,profile,ownership:'stage-local',id:'declared'}as const,sentinel=Object.assign(Error('Core range diagnostic'),{code:'E_NATIVE_TEMPORAL_RANGE'});let calls=0;const binding={info,window:async(ctx:unknown,o:unknown)=>{assert.equal(ctx,c);assert.deepEqual(o,{});calls++;throw sentinel;}};const fx=createNativeManagedTimeEffects(env,binding);await assert.rejects(fx.shutterBlur({count:3},c),e=>e===sentinel);assert.equal(calls,1);assert.equal(fx.sourceInfo,info);});
test('unknown and future source profiles reject instead of being treated as verified sources',()=>{assert.throws(()=>createNativeManagedTimeEffects(env,{info:{...info,profile:'arbitrary-js-v1'},window:async()=>null}as never),{code:'E_PA_TIME_BINDING'});});
