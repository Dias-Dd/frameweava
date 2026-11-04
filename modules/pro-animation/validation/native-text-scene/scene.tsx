/** @jsxImportSource @frameweave/engine */
import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import type {NativeGpuScope} from '../../../native-gpu/authoring.ts';
import {withGpuResources} from '../../../gpu-effects/resource-arena.ts';
import {createGpuPixelEffects} from '../../../gpu-effects/pixel-effects.ts';
import {createNativePaImageEffects} from '../../../native-effects/pa/filters.ts';
import {createNativeGlyphRenderer,type NativeGlyphHandle} from '../../src/text-animation/index.ts';
import {createNativeTimeEffects} from '../../src/native-time/index.ts';
import {prepared} from './prepared.ts';
import {titleAnimation} from './animation.ts';
export const textStage=defineNativeStage(async init=>{
 const g=init.gpu;let capture=0;
 // Fixture-only public GPU exports. The reusable author API exposes no buffer or matrix management.
 const observed=new Proxy(g,{get(target,key){if(key==='drawMesh')return async(o:Parameters<NativeGpuScope['drawMesh']>[0])=>{const image=await target.drawMesh(o);if(capture<3){await g.publishBuffer('glyph-'+capture,o.positions,{version:1});const palette=await g.imageToBuffer!(o.texture!.image,{version:1});await g.publishBuffer('palette-'+capture,palette,{version:1});await g.releaseBuffer(palette);}capture++;return image;};const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
 const text=createNativeGlyphRenderer({...init,gpu:observed}),handles:NativeGlyphHandle[]=[];for(const p of prepared)handles.push(await text.prepare(p.mesh));
 const animations=prepared.map(p=>titleAnimation(p.mesh,p.words)),time=createNativeTimeEffects(init),over=createGpuPixelEffects(g),pa=createNativePaImageEffects(init);
 return {async renderAt(context,_inputs,props:{format:'rgba16float'|'rgba32float';blur:boolean}){
  capture=0;const source=async(sample:{context:typeof context})=>withGpuResources(g,async arena=>{const frame=text.at(sample.context);let image;
   for(let i=0;i<handles.length;i++){const value=arena.image(await frame.draw(handles[i],{transform:animations[i],ink:[-.2,2.4,4,.85],format:'rgba32float'}));image=image?arena.image(await over.over(value,image,{format:'rgba32float'})):value;}return arena.keep(image!);
  });
  const image=props.blur?await time.shutterBlur(source,{count:8,angleDegrees:180,format:props.format},context):await time.retime(source,{format:props.format},context);
  try{const final=await pa.processImage(image,(i,fx)=>fx.glow(i,{radius:1.5,intensity:.18,threshold:.5,format:props.format}),{context}),view=await g.imageToBuffer!(final,{version:1});await g.publishBuffer('pixels',view,{version:1});await g.releaseBuffer(view);return final;}finally{await g.release(image);}
 },async dispose(){await text.dispose();await pa.dispose();}};
});
export function nativeTextScene(format:'rgba16float'|'rgba32float',blur=true){return <Composition width={600} height={360} fps={24} durationInFrames={48} background="transparent"><Stage id="text" factory={textStage} props={{format,blur}}/><Layer source={ref('text')}/></Composition>;}
