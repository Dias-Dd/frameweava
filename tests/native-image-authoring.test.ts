import test from 'node:test';import assert from 'node:assert/strict';
import {EngineError} from '../src/core/errors.ts';import {keyframes} from '../src/core/animation.ts';
import {linear709} from '../src/media/surface.ts';import {NativeRecordingScope} from '../modules/native-gpu/scope.ts';
import type {NativeStageInit} from '../modules/native-gpu/authoring.ts';import type {NativeResource} from '../modules/native-gpu/resources.ts';
import type {GpuPixelImage} from '../modules/gpu-effects/pixel-types.ts';
import {createNativeProfessionalEffects} from '../modules/native-effects/extended.ts';
import {compose,imageResource,imageStage,floatImageResource,createImageTools,blur,exposure,lut3D,applyMatte,withEffects,type ImageFrame,type ImageEffect} from '../modules/native-effects/authoring/index.ts';
const token={info:{version:1,width:17,height:9,format:'rgba32float',color:linear709,alpha:'premultiplied'}} as GpuPixelImage;
const recorder=new NativeRecordingScope(),init:NativeStageInit={gpu:recorder.api,width:17,height:9,seed:7,resources:{}};
const context={frame:6,globalFrame:6,time:.25,globalTime:.25,dt:1/24,progress:.5,fps:{num:24,den:1},durationInFrames:12,seed:37};
const frame:ImageFrame={init,context,signal:undefined,async process(){throw Error('No GPU execution in descriptor tests');},async generate(){throw Error('No GPU execution in descriptor tests');},async resource(){return token;},async input(){return token;},async asset<T>():Promise<T>{throw Error('No assets in descriptor test');}};
test('composition uses ordinary async functions, exact order and supplied frame',async()=>{const order:string[]=[];const a:ImageEffect=async(i,f)=>{assert.equal(f.context,context);order.push('a');return i;},b:ImageEffect=i=>{order.push('b');return i;};assert.equal(await compose(a,b,a)(token,frame),token);assert.deepEqual(order,['a','b','a']);assert.equal(await compose()(token,frame),token);});
test('invalid/sparse steps and invalid callback results are located',async()=>{assert.throws(()=>compose(9 as never),{code:'E_IMAGE_AUTHORING_PARAMETER'});assert.throws(()=>compose(...new Array<ImageEffect>(2)),{code:'E_IMAGE_AUTHORING_PARAMETER'});await assert.rejects(async()=>compose(()=>'' as never)(token,frame),(e:unknown)=>e instanceof EngineError&&e.code==='E_IMAGE_AUTHORING_PARAMETER'&&e.frame===6);});
test('original engine code/hint remains and operation index is attached',async()=>{const broken:ImageEffect=function broken(){throw new EngineError('E_ORIGINAL','Original validation failed',{hint:'Use finite radius',details:{path:'radius'}});};await assert.rejects(async()=>compose(i=>i,broken)(token,frame),(e:unknown)=>e instanceof EngineError&&e.code==='E_ORIGINAL'&&e.hint==='Use finite radius'&&e.frame===6&&JSON.stringify(e.details).includes('"index":1'));});
test('cancelled composition records no custom operation',async()=>{let ran=false;await assert.rejects(async()=>compose(i=>{ran=true;return i;})(token,{...frame,signal:AbortSignal.abort()}),{code:'E_RENDER_CANCELLED'});assert.equal(ran,false);});
test('imageResource has explicit sealed-ID input and Stage defaults',async()=>{let seen:NativeResource|undefined;const source=imageResource('photo');assert.equal(await source({...frame,resource:async r=>{seen=r;return token;}}),token);assert.deepEqual(seen,{version:1,id:'photo',decode:'icc-sdr',output:{width:17,height:9,color:linear709,format:'rgba32float',alpha:'premultiplied'},missingProfile:'assume-srgb'});assert.throws(()=>imageResource(''),{code:'E_IMAGE_AUTHORING_PARAMETER'});assert.throws(()=>imageResource('photo',{path:'/outside'}as never),{code:'E_IMAGE_AUTHORING_PARAMETER'});});
test('convenience stage remains the existing Native factory and checks options',()=>{assert.equal(typeof imageStage(compose()),'function');assert.throws(()=>imageStage(compose(),{gpu:'new-device'}as never),{code:'E_IMAGE_AUTHORING_PARAMETER'});assert.throws(()=>createImageTools(init),{code:'E_NATIVE_EFFECTS_DEVICE'});});
test('named operators construct without GPU or file access',()=>{assert.equal(typeof blur(),'function');assert.equal(typeof blur(2),'function');assert.equal(typeof blur(keyframes([{frame:0,value:1},{frame:6,value:2}])),'function');assert.equal(typeof exposure(.5),'function');});
test('immutable sources require initialization and reject nonprofessional output',()=>{const source=floatImageResource('photo');assert.equal(typeof source.prepare,'function');assert.throws(()=>source(frame),{code:'E_IMAGE_SOURCE_INITIALIZATION'});assert.throws(()=>floatImageResource('photo',{format:'rgba8'}as never),{code:'E_IMAGE_AUTHORING_PARAMETER'});});
test('arbitrary compatible factories keep a typed ordinary-function entry',()=>{assert.throws(()=>withEffects(0 as never,async i=>i),{code:'E_IMAGE_AUTHORING_PARAMETER'});});
// Compile-time acceptance/rejections, without running intentionally invalid calls.
function typedApi(){blur({radius:2,boundary:'clamp',format:'rgba16float'});exposure({stops:1,workingColor:linear709});
 withEffects(createNativeProfessionalEffects,(image,fx)=>fx.levels(image,{gamma:[1,1,1]}));withEffects(createNativeProfessionalEffects,image=>image);
 // @ts-expect-error radius is numeric/Signal, never text
 blur({radius:'large'});
 // @ts-expect-error missing a caller-provided LUT is not silently invented
 lut3D();
 // @ts-expect-error a mask requires an actual source/image
 applyMatte('mask.png');
 // @ts-expect-error retain professional float precision
 blur({format:'rgba8'});
}void typedApi;
