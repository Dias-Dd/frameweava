/** @jsxImportSource @frameweave/engine */
import {Composition,Stage,Layer,ref,linear709} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {createNativeMotionTimeEffects} from '../../src/native-motion-time/index.ts';
import {createNativePaImageEffects} from '../../../native-effects/pa/filters.ts';
import {withGpuResources} from '../../../gpu-effects/resource-arena.ts';
const generator={abiVersion:1 as const,id:'validation/motion-time/texture',version:'1.0.0',inputCount:0,parameterWords:1,code:`fn pixel(p:vec2u)->vec4f{let u=f32(p.x)-paramF32(0u);let v=f32(p.y);let s=.5+.2*sin(u*.21+v*.07)+.15*cos(u*.05-v*.19)+.1*sin(u*.013*v*.011);let hit=u>=8.&&u<112.&&v>=8.&&v<88.;return select(vec4f(0.),vec4f(s*4.,s*.8-.9,(1.-s)*2.,.5),hit);}`};
const offsets={abiVersion:1 as const,id:'validation/motion-time/offsets',version:'1.0.0',bindings:[{type:'f32' as const,access:'read_write' as const}],parameterWords:0,workgroupSize:[8,8,1] as const,code:'fn compute(g:vec3u,l:vec3u,w:vec3u){store0(g.y*workItems().x+g.x,(2.*f32(g.x)/f32(workItems().x-1u)-1.)/24.);}'};
export const motionTimeStage=defineNativeStage(async init=>{const g=init.gpu,fx=createNativeMotionTimeEffects(init),pa=createNativePaImageEffects(init),kernel=await g.compile(generator);return {async renderAt(c,_i,p:{format:'rgba32float'|'rgba16float'}){return withGpuResources(g,async a=>{
 const capture=async(name:string,image:any)=>{const view=await g.imageToBuffer!(image,{version:1});try{await g.publishBuffer(name,view,{version:1});}finally{await g.releaseBuffer(view);}return image;};
 const source=async(s:any)=>g.run(kernel,[],{parameters:Float32Array.of(2*s.context.frame),output:{width:init.width,height:init.height,format:p.format,alpha:'premultiplied',color:linear709}});
 const at=(frame:number)=>source({context:{...c,frame,time:frame/24}}),first=a.image(await at(c.frame)),second=a.image(await at(c.frame+1)),left=a.image(await at(c.frame-1)),truth=a.image(await at(c.frame+.5));await capture('first',first);await capture('second',second);await capture('left',left);await capture('truth',truth);
 const flow=a.buffer(await fx.estimateFlow(first,second,{spacing:8,window:8,radius:4}));await g.publishBuffer('estimated',flow,{version:1});
 const constant=a.buffer(await fx.constantFlow([3,4],{spacing:8}));await g.publishBuffer('constantFlow',constant,{version:1});
 const fields={scaleFlow:await fx.scaleFlow(constant,.5),addFlows:await fx.addFlows(constant,constant),mixFlows:await fx.mixFlows(constant,constant,.371),limitFlow:await fx.limitFlow(constant,2.5),rotateFlow:await fx.rotateFlow(constant,Math.PI/2),normalizeFlow:await fx.normalizeFlow(constant),offsetFlow:await fx.offsetFlow(constant,[-1,2]),composeFlows:await fx.composeFlows(constant,constant),smoothFlow:await fx.smoothFlow(constant),resampleFlow:await fx.resampleFlow(constant,4),medianFlow:await fx.medianFlow(constant),flowMagnitude:await fx.flowMagnitude(constant),flowAngle:await fx.flowAngle(constant),flowDivergence:await fx.flowDivergence(constant),flowCurl:await fx.flowCurl(constant)};
 for(const [name,field]of Object.entries(fields)){a.buffer(field);await g.publishBuffer(name,field,{version:1});}
 const interpolated=a.image(await fx.interpolateFrames(first,second,flow,{fraction:.5,format:p.format}));await capture('interpolateFrames',interpolated);
 const warped=a.image(await fx.warpFrame(first,flow,{amount:-.5,format:p.format}));await capture('warpFrame',warped);
 const vectorBlur=a.image(await fx.motionVectorBlur(first,flow,{samples:8,angleDegrees:360,format:p.format}));await capture('motionVectorBlur',vectorBlur);
 const pixelBlur=a.image(await fx.pixelMotionBlur(source,{samples:8,angleDegrees:360,format:p.format},c));await capture('pixelMotionBlur',pixelBlur);
 const retimed=a.image(await fx.timeWarp(source,{time:c.time+.5/24,format:p.format},c));await capture('timeWarp',retimed);
 const map=a.buffer(await g.createField({type:'f32',dimensions:[init.width,init.height,1],components:1,semantic:'generic',space:'image/pixel-centres',units:'seconds'}));await g.dispatch(await g.compileCompute(offsets),[map],{workItems:[init.width,init.height,1]});await g.publishBuffer('offsets',map,{version:1});
 const displaced=a.image(await fx.timeDisplacement(source,map,{startOffset:-1/24,endOffset:1/24,step:1/24,boundary:'clamp',format:p.format},c));await capture('timeDisplacement',displaced);
 const final=a.image(await pa.processImage(displaced,(i,f)=>f.glow(i,{radius:1.25,intensity:.12,threshold:.5,format:p.format}),{context:c}));await capture('pixels',final);return a.keep(final);
 });},async dispose(){await pa.dispose();}};});
export function scene(format:'rgba32float'|'rgba16float'){return <Composition width={128} height={96} fps={24} durationInFrames={8} background="transparent"><Stage id="motionTime" factory={motionTimeStage} props={{format}}/><Layer source={ref('motionTime')}/></Composition>;}
