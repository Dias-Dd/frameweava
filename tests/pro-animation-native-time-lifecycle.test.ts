import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeTimeEffects,type NativeTemporalPixelAdapter} from '../modules/pro-animation/src/native-time/index.ts';
import {NativeRecordingScope} from '../modules/native-gpu/scope.ts';
import {linear709} from '../src/media/surface.ts';
import type {FrameContext} from '../src/core/types.ts';
import type {NativeGpuScope} from '../modules/native-gpu/authoring.ts';
import type {GpuPixelImage} from '../modules/gpu-effects/pixel-types.ts';
const context:FrameContext={frame:12,globalFrame:12,time:.5,globalTime:.5,dt:1/24,fps:{num:24,den:1},durationInFrames:25,progress:.5,seed:37};
const kernel={abiVersion:1 as const,id:'test/time-lifecycle/source',version:'1.0.0',inputCount:0,parameterWords:0,code:'fn pixel(p:vec2u)->vec4f{return vec4f(-.25,4.,.5,.5);}'};
// Recording/ownership unit tests only. Hardware execution is covered separately by the real GPU test.
function fixture(){
 const base=new NativeRecordingScope(),images=new Set<object>(),buffers=new Set<object>(),owner=base.api;
 const g={...owner,capabilities:()=>({...owner.capabilities(),hardwareVerified:true}),run:async(...args:Parameters<NativeGpuScope['run']>)=>{const image=await owner.run(...args);images.add(image);return image;},release:async(image:GpuPixelImage)=>{await owner.release(image);assert.ok(images.delete(image),'each owned image released exactly once');}} as NativeGpuScope;
 for(const method of ['createBuffer','createField','imageToBuffer'] as const)(g as any)[method]=async(...args:unknown[])=>{const value=await Reflect.apply(owner[method]!,owner,args);buffers.add(value);return value;};
 g.releaseBuffer=async b=>{await owner.releaseBuffer(b);assert.ok(buffers.delete(b),'each scratch/view released exactly once');};
 const image=async(width=4)=>g.run(await g.compile(kernel),[],{output:{width,height:2,format:'rgba32float',alpha:'premultiplied',color:linear709}});
 return {base,g,image,images,buffers,clean(){assert.equal(images.size,0);assert.equal(buffers.size,0);}};
}
test('native time preflight rejects bad options, wrong device and pre-cancel before source callbacks',async()=>{
 const f=fixture(),fx=createNativeTimeEffects({gpu:f.g,width:4,height:2});let calls=0;const source=async()=>{calls++;return f.image();};
 await assert.rejects(fx.echo(source,{echoes:-1},context),{code:'E_PA_NATIVE_TIME'});
 await assert.rejects(fx.retime(source,{method:'bad' as never},context),{code:'E_PA_NATIVE_TIME'});
 await assert.rejects(fx.retime(source,{signal:AbortSignal.abort()},context),{code:'E_RENDER_CANCELLED'});
 assert.throws(()=>createNativeTimeEffects({gpu:f.base.api,width:4,height:2}),{code:'E_PA_TIME_DEVICE'});
 assert.equal(calls,0);assert.equal(f.g.stats().runs,0);f.clean();await f.g.dispose();
});
test('transferred images, resident views and hi/lo fields clean up after source errors and retry',async()=>{
 const f=fixture(),fx=createNativeTimeEffects({gpu:f.g,width:4,height:2});let calls=0;
 await assert.rejects(fx.echo(async()=>{if(calls++===1)throw new Error('source decode failed');return f.image();},{echoes:3},context),/source decode failed/);f.clean();
 f.base.beginFrame();const result=await fx.retime(()=>f.image(),{},context);assert.equal(f.images.size,1);assert.equal(f.buffers.size,0);await f.g.release(result);f.clean();assert.equal(fx.stats().busy,false);assert.equal(fx.stats().failed,1);await f.g.dispose();
});
test('cancellation after an awaited callback releases the new image and all scratch',async()=>{
 const f=fixture(),fx=createNativeTimeEffects({gpu:f.g,width:4,height:2}),controller=new AbortController();
 await assert.rejects(fx.echo(async()=>{const image=await f.image();controller.abort();return image;},{echoes:3,signal:controller.signal},context),{code:'E_RENDER_CANCELLED'});f.clean();assert.equal(fx.stats().busy,false);await f.g.dispose();
});
test('mismatched dimensions and repeated transfers fail with no double release',async()=>{
 const f=fixture(),fx=createNativeTimeEffects({gpu:f.g,width:4,height:2});await assert.rejects(fx.retime(()=>f.image(5),{},context),{code:'E_PA_NATIVE_TIME'});f.clean();f.base.beginFrame();let cached:GpuPixelImage|undefined;
 await assert.rejects(fx.echo(async()=>cached??=await f.image(),{echoes:2},context),{code:'E_PA_NATIVE_TIME'});f.clean();await f.g.dispose();
});
test('same Stage operation cannot overlap but becomes reusable after completion',async()=>{
 const f=fixture(),fx=createNativeTimeEffects({gpu:f.g,width:4,height:2});let resolve!:()=>void;const gate=new Promise<void>(r=>{resolve=r;});
 const pending=fx.retime(async()=>{await gate;return f.image();},{},context);await assert.rejects(fx.retime(()=>f.image(),{},context),{code:'E_PA_TIME_BUSY'});resolve();const image=await pending;await f.g.release(image);f.clean();await f.g.dispose();
});
test('adapter cannot claim success without consuming the complete finite plan',async()=>{
 const f=fixture(),short:NativeTemporalPixelAdapter={profile:'native-temporal-compensated-v1',reduce:()=>f.image()},fx=createNativeTimeEffects({gpu:f.g,width:4,height:2},short);
 await assert.rejects(fx.echo(()=>f.image(),{echoes:2},context),{code:'E_PA_TIME_KERNEL_PROTOCOL'});f.clean();await f.g.dispose();
});
test('transparent and zero-weight samples do not call source but produce a real recorded zero result',async()=>{
 const f=fixture(),fx=createNativeTimeEffects({gpu:f.g,width:4,height:2});let called=false;const result=await fx.retime(async()=>{called=true;return f.image();},{time:-1,range:{start:0,end:1,boundary:'transparent'}},context);
 assert.equal(called,false);assert.equal(fx.stats().transparentSamples,1);assert.ok(f.g.stats().runs>0);await f.g.release(result);f.clean();await f.g.dispose();
});
