// SPDX-License-Identifier: Apache-2.0
import type {FrameContext} from '../../../../src/core/types.ts';
import {linear709} from '../../../../src/media/surface.ts';
import type {GpuPixelImage} from '../../../gpu-effects/pixel-types.ts';
import {samePixelColor} from '../../../gpu-effects/pixel-shader.ts';
import {withGpuResources} from '../../../gpu-effects/resource-arena.ts';
import {reconstruction} from '../../../native-effects/geometry/control.ts';
import {createNativeEstimationEffects} from '../../../native-effects/image-estimation/filters.ts';
import {createNativeMotionTimeEffects} from '../native-motion-time/index.ts';
import {frameBlendSamples,shutterTimeSamples} from '../native-time/plans.ts';
import {nativeTemporalPixels} from '../native-time/reduction.ts';
import type {NativeTimeEnvironment,NativeTimeSource} from '../native-time/types.ts';
import {frame,native,fail,aborted,sampleAt,copyKernel,split} from './common.ts';
import {resolveWarpTime} from './plans.ts';
import {snapshotTimewarpControls,resolveTimewarpControls,fractionParameters,type TimewarpControls} from './warp-controls.ts';
import {prepareWarp,reconstructWarp} from './warp-kernels.ts';
export interface TimewarpSources {image:NativeTimeSource;warp?:NativeTimeSource;matte?:NativeTimeSource}
/** Mitchell-Netravali B=C=1/3 from the existing shared reconstruction function.
 * Phase quantization is explicit (default 1/1024 pixel); no silent bicubic label. */
export function warpFilterTable(phases:number,byteBudget=64*1024**2){if(!Number.isSafeInteger(phases)||phases<1||phases>0x7fffffff||!Number.isSafeInteger((phases+1)*8))fail('Filter phase count must fit the native buffer ABI');if(!Number.isSafeInteger(byteBudget)||byteBudget<64||(phases+1)*32>byteBudget)fail('Filter table exceeds the adjustable coefficient byte budget',{requiredBytes:(phases+1)*32,byteBudget});const out=new Float32Array((phases+1)*8);for(let i=0;i<=phases;i++){const w=Array.from({length:4},(_,j)=>reconstruction(j-1-i/phases,'mitchell')),sum=w.reduce((a,b)=>a+b,0);for(let j=0;j<4;j++)out.set(split(w[j]/sum),(i*4+j)*2);}return out;}
/** Stateless per-call adapter: owns temporary images/fields only. Sources transfer
 * fresh owner-local images. No retained history, second flow estimator or runner. */
export async function renderTimewarp(environment:NativeTimeEnvironment,input:TimewarpSources,options:TimewarpControls,context:FrameContext):Promise<GpuPixelImage>{
 native(environment);if(!input||Object.keys(input).some(k=>!['image','warp','matte'].includes(k))||typeof input.image!=='function'||input.warp!==undefined&&typeof input.warp!=='function'||input.matte!==undefined&&typeof input.matte!=='function')fail('Explicit fresh image/warp/matte temporal source callbacks required');
 const sources=Object.freeze({image:input.image,warp:input.warp,matte:input.matte});
 const c=frame(context),o=snapshotTimewarpControls(options),g=environment.gpu,motion=createNativeMotionTimeEffects(environment);
 async function at(c:FrameContext,outputFormat=o.format??environment.format??'rgba32float'):Promise<GpuPixelImage>{
  aborted(o.signal);const controls=resolveTimewarpControls(o,c,environment.width,environment.height),time=resolveWarpTime(controls.timing,c).time,plan=frameBlendSamples({time,fps:controls.fps,method:controls.method==='whole-frames'?'nearest':'linear'},c);
  const limits=g.capabilities().limits;if(controls.tableBytes>Math.min(limits.maxBufferSize,limits.maxStorageBufferBindingSize))fail('Filter table exceeds actual admitted device buffer limits',{requiredBytes:controls.tableBytes});
  if(!sources.matte&&['foreground','background','matte'].includes(controls.show))fail('Matte view requires an explicit matte source');
  if(controls.method!=='pixel-motion'&&controls.show!=='final')fail('Diagnostic views require pixel-motion');
  return withGpuResources(g,async a=>{
   const seen=new WeakSet<object>(),get=async(source:NativeTimeSource,t:number)=>{const image=await sampleAt(environment,source,t,c,o.range,o.signal);if(seen.has(image))fail('Every sample must transfer a fresh owned image');seen.add(image);return a.image(image);};
   const first=await get(sources.image,plan.at(0).time),second=plan.count===1?first:await get(sources.image,plan.at(1).time);if(!samePixelColor(first.info.color,second.info.color)||o.shutter&&!samePixelColor(first.info.color,environment.color??linear709))fail('Source encoding changed or differs from the shutter working color');
   const p=fractionParameters(controls.params,plan.count===1?0:plan.at(1).weight);p[10]=Number(!!sources.matte);
   const matte=sources.matte?await get(sources.matte,time):first;
   const prepare=async(image:GpuPixelImage,region:number,mask=matte)=>{if(!samePixelColor(image.info.color,first.info.color))fail('All Timewarp roles require the same declared linear encoding');const params=p.slice();params[19]=region;return a.image(await g.run(await g.compile(prepareWarp),[image,mask],{parameters:params,output:{...image.info,format:'rgba32float',alpha:'premultiplied'},signal:o.signal}));};
   const left=await prepare(first,0),right=second===first?left:await prepare(second,0);
   if(controls.method==='whole-frames'||plan.count===1&&controls.show==='final')return a.keep(a.image(await g.run(await g.compile(copyKernel),[left],{output:{...left.info,format:outputFormat},signal:o.signal})));
   if(controls.method==='frame-mix')return nativeTemporalPixels.reduce(g,(async function*(){yield {image:left,weight:plan.at(0).weight};yield {image:right,weight:plan.at(1).weight};})(),{mode:'weighted-mean',sampleCount:2,weights:[plan.at(0).weight,plan.at(1).weight],output:{width:environment.width,height:environment.height,color:first.info.color,format:outputFormat},signal:o.signal});
   const warpA=sources.warp?await get(sources.warp,plan.at(0).time):first,warpB=sources.warp?await get(sources.warp,plan.at(plan.count-1).time):second;
   const flows=[];for(let region=1;region<=(sources.matte?2:1);region++){
    const grayA=await prepare(warpA,region),grayB=await prepare(warpB,region);let analysisB=grayB;
    if(o.correctLuminanceChanges){const fx=createNativeEstimationEffects(environment);try{const corrected=await fx.processImage(grayB,(i,f)=>f.autoColorStabilize(i,grayA,{strength:1}),{context:c});analysisB=a.image(await g.run(await g.compile(copyKernel),[corrected],{output:{...grayB.info},signal:o.signal}));}finally{await fx.dispose();}}
    let flow=a.buffer(await motion.estimateFlow(grayA,analysisB,{...controls.flow,fromTime:plan.at(0).time,toTime:plan.at(plan.count-1).time,signal:o.signal}));for(let i=0;i<controls.smooth;i++)flow=a.buffer(await motion.smoothFlow(flow));flows.push(flow);
   }
   const fg=flows[0],bg=flows[1]??fg;p[4]=fg.info.dimensions[0];p[5]=fg.info.dimensions[1];new Float32Array(p.buffer)[6]=controls.flow.spacing;
   const table=warpFilterTable(controls.filtering==='extreme'?controls.phases:1,controls.tableBudget),lut=a.buffer(await g.createBuffer({type:'f32',length:table.length},table)),preparedMatte=await prepare(matte,0);
   const result=a.image(await g.run(await g.compile(reconstructWarp),[left,right,preparedMatte],{parameters:p,data:[fg,bg,lut],output:{width:environment.width,height:environment.height,format:outputFormat,color:first.info.color,alpha:'premultiplied'},signal:o.signal}));aborted(o.signal);return a.keep(result);
  });
 }
 if(!o.shutter)return at(c);
 const shutter=shutterTimeSamples(o.shutter,c),format=o.format??environment.format??'rgba32float';
 async function* samples(){for(const s of shutter){aborted(o.signal);const image=await at(s.context,'rgba32float');try{yield {image,weight:s.weight};}finally{await g.release(image);}}}
 return nativeTemporalPixels.reduce(g,samples(),{mode:'weighted-mean',sampleCount:shutter.count,weights:{*[Symbol.iterator](){for(const s of shutter)yield s.weight;}},output:{width:environment.width,height:environment.height,color:environment.color??linear709,format},signal:o.signal});
}
