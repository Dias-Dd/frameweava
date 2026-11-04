// SPDX-License-Identifier: Apache-2.0
// Temporal orchestration only: existing shutterSamples/Signal, existing Image
// Wipe, and existing compensated crossDissolve. No second accumulation engine.
import {EngineError} from '../../../../src/core/errors.ts';
import {evaluate} from '../../../../src/core/animation.ts';
import type {FrameContext} from '../../../../src/core/types.ts';
import type {NativeGpuScope} from '../../../native-gpu/authoring.ts';
import type {GpuPixelImage} from '../../../gpu-effects/pixel-types.ts';
import {withGpuResources} from '../../../gpu-effects/resource-arena.ts';
import {samePixelColor} from '../../../gpu-effects/pixel-shader.ts';
import {arithmetic} from '../../../gpu-image-effects/resident/arithmetic.ts';
import {maskSampleContexts} from './extended-controls.ts';
import type {ImageWipeOptions,TransitionOptions} from './types.ts';
type Wipe=(a:GpuPixelImage,b:GpuPixelImage,m:GpuPixelImage,o:ImageWipeOptions,c:FrameContext)=>Promise<GpuPixelImage>;
type Mix=(a:GpuPixelImage,b:GpuPixelImage,o:TransitionOptions)=>Promise<GpuPixelImage>;
const fail=(message:string):never=>{throw new EngineError('E_PA_TRANSITION',message);};
const constant={abiVersion:1 as const,id:'frameweave/pro-animation/temporal-gradient/coverage-constant',version:'1.0.0',inputCount:0,parameterWords:1,code:'fn pixel(p:vec2u)->vec4f{let c=paramF32(0u);return vec4f(c,c,c,1.);}'};
const publish={abiVersion:1 as const,id:'frameweave/pro-animation/temporal-gradient/publish',version:'1.0.0',inputCount:3,parameterWords:0,code:arithmetic+`
fn pm(v:vec4f,a:u32)->vec4f{if(a==1u){return vec4f(v.rgb*v.a,v.a);}return v;}
fn pixel(p:vec2u)->vec4f{let a=pm(read0(vec2i(p)),alpha0());let b=pm(read1(vec2i(p)),alpha1());let t=pair(vec4f(read2(vec2i(p)).r));return rounded(add(multiply(pair(a),subtract(pair(vec4f(1.)),t)),multiply(pair(b),t)));}`};
export async function recordTemporalGradient(gpu:NativeGpuScope,a:GpuPixelImage,b:GpuPixelImage,baseline:GpuPixelImage,o:ImageWipeOptions,context:FrameContext|undefined,wipe:Wipe,mix:Mix){
 if(!o||Object.keys(o).some(k=>!['progress','format','signal','softness','range','placement','invert','channel','blur','borderSoftness','autoSoftness','temporalSamples','gradientAt'].includes(k)))fail('Unknown animated-gradient option');
 if(!context||o.autoSoftness!==true||typeof o.gradientAt!=='function')fail('gradientAt requires Auto Softness and FrameContext');
 const count=o.temporalSamples??16;if(!Number.isSafeInteger(count)||count<1)fail('Positive temporal sample count required');
 if(count*2+2>gpu.capabilities().maxPendingPasses)throw new EngineError('E_PA_TRANSITION_LIMIT','Gradient quadrature exceeds the current owner command budget');
 if(!a?.info||!b?.info||!baseline?.info||a.info.width!==b.info.width||a.info.height!==b.info.height||[a,b,baseline].some(image=>!['rgba16float','rgba32float'].includes(image.info.format)||image.info.color.transfer!=='linear'||image.info.color.reference!=='scene'||!samePixelColor(image.info.color,a.info.color)))fail('Professional sources and a same-encoding reference gradient are required');
 if(o.format!==undefined&&!['rgba16float','rgba32float'].includes(o.format))fail('Output must remain RGBA16F/32F');
 if(o.signal!==undefined&&!(o.signal instanceof AbortSignal))fail('AbortSignal required');
 if(o.signal?.aborted)throw new EngineError('E_RENDER_CANCELLED','Gradient shutter cancelled');
 const {gradientAt,autoSoftness:_auto,temporalSamples:_count,format,...spatial}=o;
 const output={width:a.info.width,height:a.info.height,color:a.info.color,format:'rgba32float' as const,alpha:'opaque' as const};
 return withGpuResources(gpu,async arena=>{
  const kernel=await gpu.compile(constant),black=arena.image(await gpu.run(kernel,[],{parameters:Float32Array.of(0),output,signal:o.signal})),white=arena.image(await gpu.run(kernel,[],{parameters:Float32Array.of(1),output,signal:o.signal}));
  const seen=new Set([a,b,baseline]);let mean:GpuPixelImage|undefined;
  for(const {index,context:sample}of maskSampleContexts(context!,count)){
   if(o.signal?.aborted)throw new EngineError('E_RENDER_CANCELLED','Gradient shutter cancelled');
   const image=await gradientAt!(sample);if(!image||seen.has(image))fail('gradientAt must transfer a fresh resident image for each sample');seen.add(image);arena.image(image);
   if(!image.info||!['rgba16float','rgba32float'].includes(image.info.format)||!samePixelColor(image.info.color,a.info.color))fail('Sampled gradient requires matching scene-linear encoding');
   const progress=o.progress===undefined?sample.progress:evaluate(o.progress,sample);if(typeof progress!=='number'||!Number.isFinite(progress))fail('Finite sampled completion required');
   const part=arena.image(await wipe(black,white,image,{...spatial,progress:Math.max(0,Math.min(1,progress)),format:'rgba32float'},sample));
   mean=mean?arena.image(await mix(mean,part,{progress:1/(index+1),format:'rgba32float',signal:o.signal})):part;
  }
  return gpu.run(await gpu.compile(publish),[a,b,mean!],{output:{format:format??a.info.format,alpha:'premultiplied'},signal:o.signal});
 });
}
