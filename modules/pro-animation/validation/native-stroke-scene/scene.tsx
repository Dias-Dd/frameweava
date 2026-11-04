/** @jsxImportSource @frameweave/engine */
import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import type {NativeGpuScope} from '../../../native-gpu/authoring.ts';
import {withGpuResources} from '../../../gpu-effects/resource-arena.ts';
import {createGpuPixelEffects} from '../../../gpu-effects/pixel-effects.ts';
import {createNativePaImageEffects} from '../../../native-effects/pa/filters.ts';
import {createNativeStrokeRenderer,type NativeStrokeHandle} from '../../src/stroke-animation/index.ts';
import {createNativeTimeEffects} from '../../src/native-time/index.ts';
import {prepared} from './prepared.ts';
import {strokeOptions} from './animation.ts';
export const strokeStage=defineNativeStage(async init=>{
 const g=init.gpu;let capture=0;const observed=new Proxy(g,{get(target,key){if(key==='drawMesh')return async(o:Parameters<NativeGpuScope['drawMesh']>[0])=>{const image=await target.drawMesh(o);if(capture<3){await g.publishBuffer('geometry-'+capture,o.positions,{version:1});const palette=await g.imageToBuffer!(o.texture!.image,{version:1});await g.publishBuffer('palette-'+capture,palette,{version:1});await g.releaseBuffer(palette);}capture++;return image;};const v=Reflect.get(target,key,target);return typeof v==='function'?v.bind(target):v;}}),stroke=createNativeStrokeRenderer({...init,gpu:observed}),handles:NativeStrokeHandle[]=[];for(const item of prepared)handles.push(await stroke.prepare(item.mesh));const time=createNativeTimeEffects(init),over=createGpuPixelEffects(g),pa=createNativePaImageEffects(init);
 return {async renderAt(context,_inputs,props:{format:'rgba16float'|'rgba32float'}){capture=0;const source=async(sample:{context:typeof context})=>withGpuResources(g,async arena=>{const frame=stroke.at(sample.context);let image;for(let i=0;i<handles.length;i++){const value=arena.image(await frame.draw(handles[i],strokeOptions(i,sample.context)));image=image?arena.image(await over.over(value,image,{format:'rgba32float'})):value;}return arena.keep(image!);});const image=await time.shutterBlur(source,{count:8,angleDegrees:180,format:props.format},context);try{const final=await pa.processImage(image,(i,fx)=>fx.glow(i,{radius:1.5,intensity:.2,threshold:.5,format:props.format}),{context}),pixels=await g.imageToBuffer!(final,{version:1});await g.publishBuffer('pixels',pixels,{version:1});await g.releaseBuffer(pixels);return final;}finally{await g.release(image);}},async dispose(){await stroke.dispose();await pa.dispose();}};
});
export function nativeStrokeScene(format:'rgba16float'|'rgba32float'){return <Composition width={600} height={360} fps={24} durationInFrames={48} background="transparent"><Stage id="stroke" factory={strokeStage} props={{format}}/><Layer source={ref('stroke')}/></Composition>;}
