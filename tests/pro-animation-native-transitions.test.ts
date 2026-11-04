import test from 'node:test';
import assert from 'node:assert/strict';
import * as API from '../modules/pro-animation/src/native-transitions/index.ts';
import {transitionKernel} from '../modules/pro-animation/src/native-transitions/kernels.ts';
import {validatePixelKernel} from '../modules/gpu-effects/pixel-shader.ts';
import {NativeRecordingScope} from '../modules/native-gpu/scope.ts';
import {linear709} from '../src/media/surface.ts';
import {expr,keyframes} from '../src/core/animation.ts';
import type {GpuPixelImage} from '../modules/gpu-effects/pixel-types.ts';
import type {NativeGpuScope} from '../modules/native-gpu/authoring.ts';
const image={info:{width:31,height:19,format:'rgba32float',alpha:'premultiplied',color:linear709}} as GpuPixelImage;
// Contract-only spy. It records no GPU evidence and is never used by GPU/media tests.
function spy(){let calls=0,last:any;const g={capabilities:()=>({backend:'native-wgpu',hardwareVerified:true}),compile:async(k:any)=>{calls++;return k;},run:async(...v:any[])=>{calls++;last=v;return image;}} as unknown as NativeGpuScope;return {g,calls:()=>calls,last:()=>last};}
const context={frame:6,globalFrame:6,time:.25,globalTime:.25,dt:1/24,progress:.25,fps:{num:24,den:1},durationInFrames:24,seed:37};
test('32 distinct named transition implementations fit existing native Pixel ABI; not aliases',()=>{
 assert.equal(API.transitionNames.length,32);const code=new Set<string>();
 for(const name of API.transitionNames){assert.equal(typeof API[name],'function');const k=transitionKernel(name);assert.deepEqual(validatePixelKernel(k),k);code.add(k.code);assert.equal(k.parameterWords,32);}
 assert.equal(code.size,32);
});
test('unadmitted standalone recorder is rejected before a GPU pass; no CPU/Web fallback',()=>{
 const scope=new NativeRecordingScope();assert.throws(()=>API.createNativeTransitions({gpu:scope.api}),{code:'E_PA_TRANSITION_DEVICE'});assert.equal(scope.api.stats().runs,0);
});
test('existing Signal/keyframes evaluate once; progress hi/lo and duplicate calls are stable',async()=>{
 const s=spy();const fx=API.createNativeTransitions({gpu:s.g});await fx.crossDissolve(image,image,{progress:keyframes([{frame:0,value:0},{frame:12,value:1}])},context);
 assert.equal(s.last()[2].parameters[0],.5);await fx.crossDissolve(image,image,{progress:expr.progress},context);assert.equal(s.last()[2].parameters[0],.25);
 await fx.crossDissolve(image,image,{progress:.123456789});const a=[...s.last()[2].parameters];await fx.crossDissolve(image,image,{progress:.123456789});assert.deepEqual([...s.last()[2].parameters],a);
 assert.equal(s.last()[2].output.alpha,'premultiplied');
});
test('bad options, dimensions, encoding and cancellation reject before compilation',async()=>{
 const s=spy(),fx=API.createNativeTransitions({gpu:s.g});const bad=[
 ()=>fx.crossDissolve(image,image),()=>fx.crossDissolve(image,image,{progress:NaN}),()=>fx.crossDissolve(image,image,{progress:1.1}),
 ()=>fx.crossDissolve(image,image,{progress:expr.progress}),()=>fx.crossDissolve(image,image,{progress:.5,format:'rgba8unorm' as never}),
 ()=>fx.directionalWipe(image,image,{progress:.5,direction:[0,0]}),()=>fx.venetianWipe(image,image,{progress:.5,count:0}),
 ()=>fx.randomBlocksWipe(image,image,{progress:.5,seed:-1}),()=>fx.starWipe(image,image,{progress:.5,points:2}),
 ()=>fx.imageWipe(image,image,image,{progress:.5,channel:'bad' as never}),()=>fx.gridWipe(image,image,{progress:.5,reverse:1 as never}),
 ()=>fx.warpTransition(image,image,image,{progress:.5,direction:'bad' as never}),()=>fx.displacementTransition(image,image,image,{progress:.5,range:[1,1]}),
 ()=>fx.cardFlipWipe(image,image,{progress:.5,stagger:-1}),()=>fx.lumaWipe(image,image,image,{progress:.5,unknown:1} as never),
 ()=>fx.crossDissolve(image,{info:{...image.info,width:30}} as GpuPixelImage,{progress:.5}),
 ()=>fx.crossDissolve(image,{info:{...image.info,color:{...linear709,primaries:'rec2020'}}} as GpuPixelImage,{progress:.5}),
 ];for(const f of bad)await assert.rejects(f,{code:'E_PA_TRANSITION'});assert.equal(s.calls(),0);
 await assert.rejects(fx.crossDissolve(image,image,{progress:.5,signal:AbortSignal.abort()}),{code:'E_RENDER_CANCELLED'});assert.equal(s.calls(),0);
});
test('mask is a third resident image, no image/data import or CPU readback',async()=>{
 const s=spy(),fx=API.createNativeTransitions({gpu:s.g});await fx.glassWipe(image,image,image,{progress:.5,displacement:20});assert.equal(s.last()[0].inputCount,3);assert.equal(s.last()[1].length,3);assert.equal(s.last()[2].data,undefined);
});
