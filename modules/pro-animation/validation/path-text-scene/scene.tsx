/** @jsxImportSource @frameweave/engine */
import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {EngineError} from '../../../../src/core/errors.ts';
import type {NativeGpuScope} from '../../../native-gpu/authoring.ts';
import {withGpuResources} from '../../../gpu-effects/resource-arena.ts';
import {createNativePaImageEffects} from '../../../native-effects/pa/filters.ts';
import {createNativeParagraphRenderer} from '../../src/text-layout/native.ts';
import {pathTextTransform} from '../../src/path-text/index.ts';
import {prepared} from './prepared.ts';
import {pathTextAt,pathInk} from './animation.ts';
export const pathTextStage=defineNativeStage(async init=>{
 const g=init.gpu,observed=new Proxy(g,{get(target,key){if(key==='drawMesh')return async(o:Parameters<NativeGpuScope['drawMesh']>[0])=>{const image=await target.drawMesh(o);await g.publishBuffer('geometry',o.positions,{version:1});const palette=await g.imageToBuffer!(o.texture!.image,{version:1});await g.publishBuffer('palette',palette,{version:1});await g.releaseBuffer(palette);return image;};const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}}),text=createNativeParagraphRenderer({...init,gpu:observed}),handle=await text.prepare(prepared.mesh),pa=createNativePaImageEffects(init);
 return {async renderAt(context,_inputs,props:{format:'rgba16float'|'rgba32float'}){
  if(!Number.isSafeInteger(context.frame)||context.frame<0||context.frame>=prepared.frames.length)throw new EngineError('E_PA_PATH_TEXT_DEMO_RANGE','Eight explicit integer-frame kurbo sample sets; resample authoring inputs after editing the finite range');
  const live=pathTextAt(prepared.frames[context.frame],context),json=JSON.stringify(live.trace),words=Uint32Array.from({length:json.length},(_,i)=>json.charCodeAt(i)),trace=await g.createBuffer({type:'u32',length:words.length},words);await g.publishBuffer('trace',trace,{version:1});await g.releaseBuffer(trace);
  return withGpuResources(g,async arena=>{const letters=arena.image(await text.at(context).draw(handle,{transform:pathTextTransform(live.frame),ink:pathInk,format:props.format})),final=arena.image(await pa.processImage(letters,(i,fx)=>fx.glow(i,{radius:1.1,intensity:.1,threshold:.5,format:props.format}),{context})),pixels=await g.imageToBuffer!(final,{version:1});await g.publishBuffer('pixels',pixels,{version:1});await g.releaseBuffer(pixels);return arena.keep(final);});
 },async dispose(){await text.dispose();await pa.dispose();}};
});
export function pathTextScene(format:'rgba16float'|'rgba32float'){return <Composition width={720} height={400} fps={24} durationInFrames={8} background="transparent"><Stage id="pathtext" factory={pathTextStage} props={{format}}/><Layer source={ref('pathtext')}/></Composition>;}
