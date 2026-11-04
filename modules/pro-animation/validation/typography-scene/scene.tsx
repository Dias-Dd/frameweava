/** @jsxImportSource @frameweave/engine */
import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import type {NativeGpuScope} from '../../../native-gpu/authoring.ts';
import {withGpuResources} from '../../../gpu-effects/resource-arena.ts';
import {createGpuPixelEffects} from '../../../gpu-effects/pixel-effects.ts';
import {createNativePaImageEffects} from '../../../native-effects/pa/filters.ts';
import {createNativeParagraphRenderer} from '../../src/text-layout/native.ts';
import {createParagraphIndex} from '../../src/text-layout/queries.ts';
import {drawPathMesh} from '../../src/path-authoring/native.ts';
import {solidStrokeInk,type PreparedStrokeMesh} from '../../src/stroke-animation/index.ts';
import {prepared} from './prepared.ts';
import {typographyAt,inkAlpha} from './animation.ts';
export const typographyStage=defineNativeStage(async init=>{
 const g=init.gpu,observed=new Proxy(g,{get(target,key){if(key==='drawMesh')return async(o:Parameters<NativeGpuScope['drawMesh']>[0])=>{const image=await target.drawMesh(o);await g.publishBuffer('geometry',o.positions,{version:1});const palette=await g.imageToBuffer!(o.texture!.image,{version:1});await g.publishBuffer('palette',palette,{version:1});await g.releaseBuffer(palette);return image;};const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}}),text=createNativeParagraphRenderer({...init,gpu:observed}),handle=await text.prepare(prepared.mesh),base=createParagraphIndex(prepared.mesh.index.source),over=createGpuPixelEffects(g),pa=createNativePaImageEffects(init);
 return {async renderAt(context,_inputs,props:{format:'rgba16float'|'rgba32float'}){
  const frame=typographyAt(base,prepared.metadata[0].metrics,context),json=JSON.stringify(frame.trace),words=Uint32Array.from({length:json.length},(_,i)=>json.charCodeAt(i)),trace=await g.createBuffer({type:'u32',length:words.length},words);await g.publishBuffer('trace',trace,{version:1});await g.releaseBuffer(trace);
  return withGpuResources(g,async arena=>{
   const letters=arena.image(await text.at(context).draw(handle,{transform:frame.transform,ink:[-.18,1.8,3.2,inkAlpha],format:props.format})),positions:number[]=[];
   for(const d of frame.decorations)for(const [x,y]of [[d.left,d.top],[d.right,d.top],[d.right,d.top+d.thickness],[d.left,d.top],[d.right,d.top+d.thickness],[d.left,d.top+d.thickness]])positions.push(x,y,.5);
   const mesh:PreparedStrokeMesh={coordinates:prepared.mesh.layout.coordinates,closed:false,positions,parameters:Array.from({length:positions.length/3},()=>0),diagnostics:[],preparation:{faces:frame.decorations.length,triangles:positions.length/9,maxAreaDeviation:0,roundTolerance:.02,gridSize:.0025,sampleCount:0}},underline=arena.image(await drawPathMesh(init,mesh,context,{ink:solidStrokeInk([-.08,.9,2,.65]),format:props.format})),combined=arena.image(await over.over(letters,underline,{format:props.format})),final=arena.image(await pa.processImage(combined,(image,fx)=>fx.glow(image,{radius:1.1,intensity:.1,threshold:.5,format:props.format}),{context})),pixels=await g.imageToBuffer!(final,{version:1});await g.publishBuffer('pixels',pixels,{version:1});await g.releaseBuffer(pixels);return arena.keep(final);
  });
 },async dispose(){await text.dispose();await pa.dispose();}};
});
export function typographyScene(format:'rgba16float'|'rgba32float'){return <Composition width={720} height={400} fps={24} durationInFrames={8} background="transparent"><Stage id="typography" factory={typographyStage} props={{format}}/><Layer source={ref('typography')}/></Composition>;}
