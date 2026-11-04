import {defineNativeStage} from '../native-gpu/authoring.ts';
import {createNativeProfessionalEffects} from './extended.ts';
import {createGeometrySeed,geometrySource} from './workload.ts';
import {extendedCases} from './extended-cases.ts';
import type {NativeGpuScope} from '../native-gpu/authoring.ts';
import type {GpuPixelImage} from '../gpu-effects/pixel-types.ts';
async function retainSource(gpu:NativeGpuScope,result:GpuPixelImage,source:GpuPixelImage){const keep=await gpu.compile({abiVersion:1,id:'fixture/retain-source',version:'1.0.0',inputCount:2,parameterWords:1,code:'fn pixel(p:vec2u)->vec4f{return select(read0(vec2i(p)),read1(vec2i(p)),paramU32(0u)!=0u);}'});return gpu.run(keep,[result,source],{parameters:Uint32Array.of(0)});}
export const extendedChecks=defineNativeStage<Record<string,never>,{format?:'rgba16float'|'rgba32float'}>(async init=>{const seed=await createGeometrySeed(init.gpu),effects=createNativeProfessionalEffects(init);return {async renderAt(c,_i,p){const source=await geometrySource(init.gpu,seed,c,init.width,init.height,p.format??'rgba32float',true),result=await effects.processImage(source,(i,fx)=>extendedCases[c.frame%extendedCases.length].apply(i,fx),{context:c});
 // Diagnostic fixture only: retain the original source through the last pass.
 // Native liveness pooling may otherwise overwrite a dead source before the
 // diagnostic read, giving the oracle the wrong input for multi-pass effects.
 return retainSource(init.gpu,result,source);
 },dispose:effects.dispose};});
/** Editable production chain: original colour, detail and matte algorithms. */
export const extendedChain=defineNativeStage<Record<string,never>,{format?:'rgba16float'|'rgba32float';diagnosticRetain?:boolean}>(async init=>{const seed=await createGeometrySeed(init.gpu),effects=createNativeProfessionalEffects(init);return {async renderAt(c,_i,p){const source=await geometrySource(init.gpu,seed,c,init.width,init.height,p.format??'rgba32float',true);const result=await effects.processImage(source,async(i,f)=>{i=await f.exposure(i,{stops:.15});i=await f.channelMix(i,{matrix:[[1,.02,0],[0,1,0],[0,0,1]]});i=await f.levels(i);i=await f.curves(i);i=await f.unsharpMask(i,{radius:.8,amount:.3});i=await f.despill(i,{amount:.2});i=await f.noise(i,{amount:.001,seed:17,animated:true});i=await f.videoLimiter(i,{black:-2,white:4});const mask=await f.extractMatte(i),clean=await f.morphology(mask,{operation:'close',radius:1.5}),soft=await f.featherMatte(clean,{radius:.8});return f.applyMatte(i,soft);},{context:c});return p.diagnosticRetain?retainSource(init.gpu,result,source):result;},dispose:effects.dispose};});
