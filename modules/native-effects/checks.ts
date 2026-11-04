// Real Stage lifecycle and publication-gap fixtures; never exported as effects.
import {defineNativeStage} from '../native-gpu/authoring.ts';
import type {GpuPixelImage} from '../gpu-effects/pixel-types.ts';
import {linear709} from '../../src/media/surface.ts';
import {createNativeImageEffects} from './images.ts';
import {createGeometrySeed,geometrySource} from './workload.ts';
async function rejects(p:Promise<unknown>,code:string){try{await p;}catch(e){if((e as {code?:string}).code===code)return;throw e;}throw Error('Expected '+code);}
export const lifecycle=defineNativeStage(init=>{const gpu=init.gpu;return {async renderAt(c){const seed=await createGeometrySeed(gpu),source=await geometrySource(gpu,seed,c,init.width,init.height,'rgba32float'),effects=createNativeImageEffects(init);
 try{
  await rejects(effects.processImage(source,async()=>({} as GpuPixelImage)),'E_NATIVE_EFFECTS_RESULT');
  const controller=new AbortController();controller.abort();const before=gpu.stats().runs;await rejects(effects.processImage(source,async(i,fx)=>fx.tint(i),{signal:controller.signal}),'E_RENDER_CANCELLED');if(gpu.stats().runs!==before)throw Error('Cancelled recipe recorded work');
  await rejects(effects.processImage(source,async(i,fx)=>{await fx.tint(i);throw Object.assign(Error('intentional'),{code:'E_FIXTURE'});}),'E_FIXTURE');
  let proceed!:()=>void;const gate=new Promise<void>(r=>{proceed=r;}),first=effects.processImage(source,async(i,fx)=>{await gate;return fx.tint(i);});await rejects(effects.processImage(source,async i=>i),'E_NATIVE_EFFECTS_BUSY');proceed();await first;
  const middle=new AbortController();await rejects(effects.processImage(source,async(i,fx)=>{await fx.tint(i);middle.abort();return fx.vignette(i);},{signal:middle.signal}),'E_RENDER_CANCELLED');
  const output=await effects.processImage(source,async(i,fx)=>fx.brightnessContrast(i));const stats=effects.stats();if(stats.retainedImages!==1||stats.cancelled!==1)throw Error('Incorrect retained/cancel counters');
  await effects.dispose();await effects.dispose();await rejects(effects.processImage(source,async i=>i),'E_NATIVE_EFFECTS_CLOSED');
  // Closing an effect module must not close the Stage-owned scope.
  await gpu.compile({abiVersion:1,id:'fixture/lifecycle-alive',version:'1.0.0',inputCount:0,parameterWords:0,code:'fn pixel(p:vec2u)->vec4f{return vec4f(1.);}'});
  void output;return source;
 }finally{await effects.dispose();await gpu.releaseBuffer(seed);}
 }};});
export const invalidPublication=defineNativeStage(init=>({async renderAt(){
 const gpu=init.gpu,k=await gpu.compile({abiVersion:1,id:'fixture/invalid-alpha',version:'1.0.0',inputCount:0,parameterWords:0,code:'fn pixel(p:vec2u)->vec4f{return vec4f(4.,-.25,2.,2.);}'}),bad=await gpu.run(k,[],{output:{width:init.width,height:init.height,format:'rgba32float',color:linear709,alpha:'premultiplied'}});
 const fix=await gpu.compile({abiVersion:1,id:'fixture/masked-alpha',version:'1.0.0',inputCount:1,parameterWords:0,code:'fn pixel(p:vec2u)->vec4f{return vec4f(read0(vec2i(p)).rgb,1.);}'});return gpu.run(fix,[bad]);
}}));
