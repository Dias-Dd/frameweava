/** @jsxImportSource @frameweave/engine */
import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import type {NativeGpuScope} from '../../../native-gpu/authoring.ts';
import {withGpuResources} from '../../../gpu-effects/resource-arena.ts';
import {createGpuPixelEffects} from '../../../gpu-effects/pixel-effects.ts';
import {createNativePaImageEffects} from '../../../native-effects/pa/filters.ts';
import {drawPathFill} from '../../src/smart-path/fill.ts';
import {drawPathMesh} from '../../src/path-authoring/native.ts';
import {solidStrokeInk} from '../../src/stroke-animation/index.ts';
import {pathControlCases,guideMesh,inkAlpha} from './cases.ts';
import {prepared} from './prepared.ts';
export const pathControlsStage=defineNativeStage(async init=>{
 const g=init.gpu,pa=createNativePaImageEffects(init),over=createGpuPixelEffects(g),observed=new Proxy(g,{get(target,key){if(key==='drawMesh')return async(o:Parameters<NativeGpuScope['drawMesh']>[0])=>{const image=await target.drawMesh(o);await g.publishBuffer('guides',o.positions,{version:1});return image;};const v=Reflect.get(target,key,target);return typeof v==='function'?v.bind(target):v;}});
 return {async renderAt(context,_inputs,props:{format:'rgba16float'|'rgba32float'}){
 const cases=pathControlCases(context),json=JSON.stringify(cases.trace),words=Uint32Array.from({length:json.length},(_,i)=>json.charCodeAt(i)),trace=await g.createBuffer({type:'u32',length:words.length},words);await g.publishBuffer('trace',trace,{version:1});await g.releaseBuffer(trace);
 return withGpuResources(g,async arena=>{
 const fill=arena.image(await drawPathFill(init,prepared[context.frame],context,{color:[-.18,1.8,3.2,1],opacity:inkAlpha,format:props.format})),fillPixels=await g.imageToBuffer!(fill,{version:1});await g.publishBuffer('fillPixels',fillPixels,{version:1});await g.releaseBuffer(fillPixels);
 const guides=arena.image(await drawPathMesh({...init,gpu:observed},guideMesh(cases.paths),context,{ink:solidStrokeInk([2,1,-.1,.65]),format:props.format})),combined=arena.image(await over.over(guides,fill,{format:props.format})),final=arena.image(await pa.processImage(combined,(i,fx)=>fx.glow(i,{radius:1.1,intensity:.1,threshold:.5,format:props.format}),{context})),pixels=await g.imageToBuffer!(final,{version:1});await g.publishBuffer('pixels',pixels,{version:1});await g.releaseBuffer(pixels);return arena.keep(final);
 });
 },async dispose(){await pa.dispose();}};
});
export function pathControlsScene(format:'rgba16float'|'rgba32float'){return <Composition width={640} height={400} fps={24} durationInFrames={8} background="transparent"><Stage id="pathControls" factory={pathControlsStage} props={{format}}/><Layer source={ref('pathControls')}/></Composition>;}
