// SPDX-License-Identifier: Apache-2.0
// Time-specific binding adapter. Original shared guarded Pair arithmetic is reused unchanged.
// No new device, generic graph/runtime, cross-frame state, CPU RGBA or unguarded F32 sum.
import {EngineError} from '../../../../src/core/errors.ts';
import type {GpuComputeKernelSource} from '../../../gpu-effects/compute-types.ts';
import type {GpuPixelKernelSourceV2} from '../../../gpu-effects/pixel-types.ts';
import {withGpuResources} from '../../../gpu-effects/resource-arena.ts';
import {samePixelColor} from '../../../gpu-effects/pixel-shader.ts';
import {displacement} from '../../../native-effects/pa/kernels.ts';
import type {NativeTemporalPixelAdapter,TemporalReduction} from './types.ts';

const end=displacement.code.indexOf('fn scalar(');
if(end<0||!displacement.code.startsWith('fn round32('))throw new Error('Reviewed shared guarded arithmetic layout changed');
const math=displacement.code.slice(0,end);
const modes:Record<TemporalReduction,number>={'weighted-mean':0,add:0,blend:0,maximum:1,minimum:2,screen:3,'in-front':4,'in-back':5};
const reduceKernel:GpuComputeKernelSource={abiVersion:1,id:'frameweave/pro-animation/time/reduce',version:'1.0.0',parameterWords:9,workgroupSize:[8,8,1],bindings:[{type:'f32',access:'read'},{type:'f32',access:'read_write'},{type:'f32',access:'read_write'}],code:math+`
fn compute(g:vec3u,l:vec3u,w:vec3u){
 let at=(g.y*paramU32(0u)+g.x)*4u;var raw=vec4f(0.);
 if(paramU32(7u)==0u){raw=vec4f(load0(at),load0(at+1u),load0(at+2u),load0(at+3u));}
 var value=pair(raw);if(paramU32(1u)==1u){let a=multiply(value,pair(vec4f(raw.a)));value=Pair(vec4f(a.hi.rgb,raw.a),vec4f(a.lo.rgb,0.));}
 let q=multiply(value,constant(paramF32(4u),paramF32(5u)));var a=pair(vec4f(0.));
 if(paramU32(3u)==0u){a=Pair(vec4f(load1(at),load1(at+1u),load1(at+2u),load1(at+3u)),vec4f(load2(at),load2(at+1u),load2(at+2u),load2(at+3u)));}
 let mode=paramU32(2u);var result=add(a,q);
 if(mode==1u||mode==2u){result=q;if(paramU32(3u)==0u){for(var c=0u;c<4u;c++){let larger=a.hi[c]>q.hi[c]||(a.hi[c]==q.hi[c]&&a.lo[c]>q.lo[c]);let takeA=select(!larger,larger,mode==1u);if(takeA){result.hi[c]=a.hi[c];result.lo[c]=a.lo[c];}}}}
 else if(mode==3u){result=subtract(add(a,q),multiply(a,q));}
 else if(mode==4u){let alpha=Pair(vec4f(a.hi.a),vec4f(a.lo.a));result=add(a,multiply(q,subtract(pair(vec4f(1.)),alpha)));}
 else if(mode==5u){let alpha=Pair(vec4f(q.hi.a),vec4f(q.lo.a));result=add(q,multiply(a,subtract(pair(vec4f(1.)),alpha)));}
 for(var c=0u;c<4u;c++){store1(at+c,result.hi[c]);store2(at+c,result.lo[c]);}
}`};
const publish:GpuPixelKernelSourceV2={abiVersion:2,id:'frameweave/pro-animation/time/publish',version:'1.0.0',inputCount:0,parameterWords:9,dataInputs:[{type:'f32'},{type:'f32'}],code:math+`
fn pixel(p:vec2u)->vec4f{let at=(p.y*outputSize().x+p.x)*4u;let value=Pair(vec4f(data0(at),data0(at+1u),data0(at+2u),data0(at+3u)),vec4f(data1(at),data1(at+1u),data1(at+2u),data1(at+3u)));var out=vec4f(0.);if(paramU32(2u)==0u){out=rounded(divide(value,constant(paramF32(0u),paramF32(1u))));}return vec4f(out.rgb,clamp(out.a,0.,1.));}`};
const fail=(message:string):never=>{throw new EngineError('E_PA_TIME_REDUCTION',message);};
const split=(x:number)=>{const hi=Math.fround(x),lo=Math.fround(x-hi);if(!Number.isFinite(hi)||!Number.isFinite(lo)||x!==0&&hi===0||hi!==0&&Math.abs(hi)<2**-126||lo!==0&&Math.abs(lo)<2**-126)fail('Temporal coefficient exceeds qualified normal F32-pair domain');return [hi,lo];};
const check=(signal?:AbortSignal)=>{if(signal?.aborted)throw new EngineError('E_RENDER_CANCELLED','Native temporal reduction cancelled');};

/** This reducer is scoped to explicit finite temporal samples. Main/Agent-3 may
 * replace the thin adapter while keeping the source/time API. Source images are borrowed. */
export const nativeTemporalPixels:NativeTemporalPixelAdapter={profile:'native-temporal-compensated-v1',async reduce(gpu,samples,options){
 const {mode,output,signal,sampleCount,weights}=options;check(signal);
 if(gpu.capabilities().backend!=='native-wgpu'||!gpu.capabilities().hardwareVerified||!gpu.imageToBuffer)fail('Native read-only resident image views are required');
 if(!Object.hasOwn(modes,mode)||!Number.isSafeInteger(sampleCount)||sampleCount<1)fail('Known operator and finite sample count required');
 const remaining=gpu.capabilities().maxPendingPasses-gpu.stats().pendingPasses;
 if(sampleCount+1>remaining)throw new EngineError('E_PA_TIME_ADMISSION','Finite temporal window exceeds the current owner command budget',{details:{minimumPasses:sampleCount+1,remaining,sourcePassesAdditional:true}});
 // Two small control-only passes over the reusable plan avoid overflow and allocate no frame array.
 let maximum=0,n=0;for(const weight of weights){check(signal);if(!Number.isFinite(weight)||weight<0)fail('Weights must be finite and nonnegative');maximum=Math.max(maximum,weight);n++;}
 if(n!==sampleCount)fail('Weight-plan count mismatch');
 const normalized=mode==='weighted-mean',power=normalized&&maximum>0?2**Math.min(1023,Math.floor(Math.log2(maximum))):1;
 let denominator=0,correction=0,secondCount=0;for(const weight of weights){if(!Number.isFinite(weight)||weight<0)fail('Reusable weight plan changed');const v=normalized?weight/power:0,next=denominator+v;correction+=Math.abs(denominator)>=Math.abs(v)?denominator-next+v:v-next+denominator;denominator=next;secondCount++;}denominator+=correction;
 if(secondCount!==sampleCount)fail('Weight plan must be repeatable, not a consumed one-shot iterator');
 const secondScale=normalized&&denominator>0?2**Math.ceil(Math.log2(denominator)):1;
 const divisor=normalized?denominator/secondScale:mode==='blend'?sampleCount:1;
 const divisorPair=divisor===0?[1,0]:split(divisor);
 return withGpuResources(gpu,async arena=>{
  const descriptor={type:'f32' as const,dimensions:[output.width,output.height,1] as const,components:4 as const,semantic:'generic' as const};
  const hi=arena.buffer(await gpu.createField({...descriptor,channels:['r-hi','g-hi','b-hi','a-hi']})),lo=arena.buffer(await gpu.createField({...descriptor,channels:['r-lo','g-lo','b-lo','a-lo']})),zero=arena.buffer(await gpu.createBuffer({type:'f32',length:4}));
  const kernel=await gpu.compileCompute(reduceKernel);let index=0;
  for await(const {image,weight}of samples){check(signal);if(index>=sampleCount)fail('More source samples than declared');
   if(!Number.isFinite(weight)||weight<0)fail('Nonnegative finite weight required');
   if((mode==='in-front'||mode==='in-back')&&weight>1)fail('Source-over weights must preserve coverage <= 1');
   if(image&&(image.info.width!==output.width||image.info.height!==output.height||!samePixelColor(image.info.color,output.color)||!['rgba16float','rgba32float'].includes(image.info.format)))fail('Temporal image metadata mismatch');
   const coefficient=normalized?(weight/power)/secondScale:weight,pair=split(coefficient);
   if(weight>0&&coefficient===0)fail('Weight ratio underflow');
   const p=new Uint32Array(9),f=new Float32Array(p.buffer);p[0]=output.width;p[1]=image?.info.alpha==='straight'?1:0;p[2]=modes[mode];p[3]=Number(index===0);f.set(pair,4);p[7]=Number(image===null);
   const view=image?await gpu.imageToBuffer!(image,{version:1,signal}):zero;
   try{await gpu.dispatch(kernel,[view,hi,lo],{workItems:[output.width,output.height,1],parameters:p,signal});}finally{if(image)await gpu.releaseBuffer(view);}
   index++;
  }
  if(index!==sampleCount)fail('Source ended before declared sample count');check(signal);
  const p=new Float32Array(9);p.set(divisorPair);new Uint32Array(p.buffer)[2]=Number(divisor===0);
  return gpu.run(await gpu.compile(publish),[],{data:[hi,lo],parameters:p,output:{...output,alpha:'premultiplied'},signal});
 });
}};
