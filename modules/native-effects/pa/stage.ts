import {defineNativeStage} from '../../native-gpu/authoring.ts';
import {linear709,type AlphaMode} from '../../../src/media/surface.ts';
import {EngineError} from '../../../src/core/errors.ts';
import type {GpuPixelKernelSourceV1,GpuPixelImage} from '../../gpu-effects/pixel-types.ts';
import {createNativePaImageEffects,nativePaImageNames} from './filters.ts';
import {createNativeRasterEffects} from '../raster/filters.ts';
import {callPa,coverageValues,ink} from './cases.ts';
import {sceneSource,sceneWarp,sceneShadow,sceneGlow} from './scene-options.ts';
import {borrowNativeScope} from '../../native-gpu/borrow.ts';
export const seedKernel:GpuPixelKernelSourceV1={abiVersion:1,id:'fixture/native-pa-seed',version:'1.0.0',inputCount:0,parameterWords:3,code:`fn pixel(p:vec2u)->vec4f{let q=(p.x+3u*p.y)%7u;let a=select(select(f32(q)/6.,0x1p-30f,q==1u),1.,paramU32(0u)==2u);let scale=select(1.,100000.,paramU32(1u)!=0u);var rgb=vec3f(2.5+f32(p.x%3u)*.125,-.25-f32(p.y%3u)*.25,.125)*scale;if(paramU32(2u)!=0u){rgb*=select(vec3f(1.),vec3f(-1.),p.x%2u==0u);}if(paramU32(0u)==0u&&a!=0.){rgb*=a;}return vec4f(rgb,a);}`};
export const mapKernel:GpuPixelKernelSourceV1={abiVersion:1,id:'fixture/native-pa-map',version:'1.0.0',inputCount:0,parameterWords:0,code:'fn pixel(p:vec2u)->vec4f{return vec4f((f32(p.x%3u)-1.)*.375,(f32(p.y%3u)-1.)*.25,23.,1.);}'};
interface Props {alpha?:AlphaMode;format?:'rgba16float'|'rgba32float';variant?:number;wide?:boolean;bipolar?:boolean;only?:number;chain?:boolean;preflight?:boolean}
export const paNumeric=defineNativeStage<Record<string,never>,Props>(init=>{const g=init.gpu,pa=createNativePaImageEffects(init);let failedOnce=false;return {async renderAt(c,_inputs,p){
 const alpha=p.alpha??'premultiplied',format=p.format??'rgba32float',a=await g.run(await g.compile(seedKernel),[],{parameters:Uint32Array.of(alpha==='premultiplied'?0:alpha==='straight'?1:2,Number(p.wide),Number(p.bipolar)),output:{width:init.width,height:init.height,format,alpha,color:linear709}}),b=await g.run(await g.compile(mapKernel),[],{output:{...a.info,alpha:'opaque'}});
 if(p.preflight){
  if(c.globalFrame===0&&!failedOnce){failedOnce=true;return pa.processImage(a,async(input,fx)=>{await fx.displacement(input,{amount:2});throw new EngineError('E_NATIVE_PA_FIXTURE','Intentional failure after control writes, before GPU acceptance');},{context:c});}
  if(pa.stats().createdDataBuffers!==pa.stats().releasedDataBuffers)throw Error('Data scratch leaked after failed recording');
  const before=g.stats().runs;for(const [request,code]of [[()=>pa.generateImage(f=>f.surfaceFromCoverage([NaN],{width:1,height:1,workingColor:linear709,ink})),'E_PA_PARAMETER'],[()=>pa.processImage(a,(_i,f)=>f.displacement(a,{amount:2,seed:-1})),'E_PA_PARAMETER'],[()=>pa.processImage(a,(_i,f)=>f.displaceWithMap(a,a,{encoding:'rg-offset-px'})),'E_PA_MAP_ENCODING'],[()=>pa.generateImage(f=>f.surfaceFromCoverage(coverageValues(init.width,init.height),{width:init.width,height:init.height,ink,workingColor:linear709,signal:AbortSignal.abort()})),'E_RENDER_CANCELLED'],[()=>pa.generateImage(async()=>undefined as never),'E_NATIVE_EFFECTS_RESULT']] as const){try{await request();throw Error('Expected '+code);}catch(e){if((e as {code?:string}).code!==code)throw e;}}
  if(g.stats().runs!==before)throw Error('Invalid/aborted work recorded a GPU pass');
 }
 const result:GpuPixelImage=p.only===99?await pa.generateImage(f=>f.surfaceFromCoverage(coverageValues(init.width,init.height),{width:init.width,height:init.height,ink,workingColor:linear709,format}),{context:c}):await pa.processImage(a,async(input,f)=>{if(p.chain){let v=await f.displacement(input,{amount:2.713,frequency:2.71,seed:2147483647,time:c.time});v=await f.innerShadow(v,{radius:.7,offset:[-1.25,1.75],color:[2,-.25,.5],opacity:.7});return f.glow(v,{radius:.8,intensity:.4});}return callPa(nativePaImageNames[(p.only??c.globalFrame)%6],f,input,b,c,p.variant);},{context:c});
 if(pa.stats().createdDataBuffers!==pa.stats().releasedDataBuffers)throw Error('Data scratch did not release logically');
 return g.run(await g.compile({abiVersion:1,id:'fixture/native-pa-capture',version:'1.0.0',inputCount:3,parameterWords:1,code:'fn pixel(p:vec2u)->vec4f{if(paramU32(0u)==1u){return read1(vec2i(p));}if(paramU32(0u)==2u){return read2(vec2i(p));}return read0(vec2i(p));}'}),[result,a,b],{parameters:Uint32Array.of(0),output:{format:'rgba32float',alpha:'premultiplied'}});
 },dispose:()=>pa.dispose()};});
/** Real authoring chain: existing shared Native scope, continuous resident images. */
export const paScene=defineNativeStage<Record<string,never>,{single?:boolean}>(init=>{const pa=createNativePaImageEffects(init),raster=createNativeRasterEffects(init),g=init.gpu;return {async renderAt(c,_inputs,p){
 const input=await sceneSource(g,init.width,init.height,c);
 const displaced=await pa.processImage(input,async(image,fx)=>{image=await fx.displacement(image,sceneWarp(c));if(p.single)return image;const shadow=await fx.innerShadow(image,sceneShadow);return fx.glow(shadow,sceneGlow);},{context:c});
 if(p.single)return displaced;return raster.processImage(displaced,(image,fx)=>fx.over(input,image),{context:c});
 },dispose:async()=>{await pa.dispose();await raster.dispose();}};});
/** Actual borrowed scope, source-only generation followed by reuse as input.
 * This qualifies the lease adapter, not an R1 package install/portable export. */
export const paBorrowed=defineNativeStage(init=>{const loan=borrowNativeScope(init.gpu),pa=createNativePaImageEffects({gpu:loan.scope});return {async renderAt(c){
 const generated=await pa.generateImage(f=>f.surfaceFromCoverage(coverageValues(init.width,init.height),{width:init.width,height:init.height,ink,workingColor:linear709}),{context:c});
 const result=await pa.processImage(generated,(image,f)=>f.displacement(image,{amount:1.25,frequency:2.5,time:c.time}),{context:c});
 const stats=pa.stats();if(stats.createdDataBuffers!==stats.releasedDataBuffers)throw Error('Borrowed data scratch leaked');return result;
 },dispose:async()=>{await pa.dispose();await pa.dispose();await loan.dispose();await loan.dispose();}};});
