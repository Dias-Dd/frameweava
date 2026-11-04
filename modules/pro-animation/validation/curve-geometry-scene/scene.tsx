/** @jsxImportSource @frameweave/engine */
import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {EngineError} from '../../../../src/core/errors.ts';
import type {NativeGpuScope} from '../../../native-gpu/authoring.ts';
import {createNativePaImageEffects} from '../../../native-effects/pa/filters.ts';
import {drawPathMesh} from '../../src/path-authoring/native.ts';
import {solidStrokeInk} from '../../src/stroke-animation/index.ts';
import {prepared,trace} from './prepared.ts';
import {inkOpacity,xShift,inkColor,geometryTrace} from './animation.ts';
export const curveGeometryStage=defineNativeStage(async init=>{
 const g=init.gpu,observed=new Proxy(g,{get(target,key){if(key==='drawMesh')return async(o:Parameters<NativeGpuScope['drawMesh']>[0])=>{const image=await target.drawMesh(o);await g.publishBuffer('geometry',o.positions,{version:1});const matrix=await g.createBuffer({type:'f32',length:o.matrix!.length},Float32Array.from(o.matrix!));await g.publishBuffer('matrix',matrix,{version:1});await g.releaseBuffer(matrix);const palette=await g.imageToBuffer!(o.texture!.image,{version:1});await g.publishBuffer('palette',palette,{version:1});await g.releaseBuffer(palette);return image;};const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}}),pa=createNativePaImageEffects(init);
 return {async renderAt(context,_inputs,props:{format:'rgba16float'|'rgba32float'}){
  if(!Number.isSafeInteger(context.frame)||context.frame<0||context.frame>=prepared.length)throw new EngineError('E_PA_GEOMETRY_DEMO_RANGE','Finite original-kurbo geometry preparation covers integer frames0..7; regenerate after editing inputs');
  const live=geometryTrace(trace[context.frame],context),json=JSON.stringify(live),words=Uint32Array.from({length:json.length},(_,i)=>json.charCodeAt(i)),traceBuffer=await g.createBuffer({type:'u32',length:words.length},words);await g.publishBuffer('trace',traceBuffer,{version:1});await g.releaseBuffer(traceBuffer);const mesh=prepared[context.frame],image=await drawPathMesh({...init,gpu:observed},mesh,context,{ink:solidStrokeInk(inkColor),opacity:inkOpacity,position:[xShift,0],format:props.format});
  try{const final=await pa.processImage(image,(i,fx)=>fx.glow(i,{radius:1.1,intensity:.1,threshold:.5,format:props.format}),{context}),pixels=await g.imageToBuffer!(final,{version:1});await g.publishBuffer('pixels',pixels,{version:1});await g.releaseBuffer(pixels);return final;}finally{await g.release(image);}
 },async dispose(){await pa.dispose();}};
});
export function curveGeometryScene(format:'rgba16float'|'rgba32float'){return <Composition width={640} height={400} fps={24} durationInFrames={8} background="transparent"><Stage id="geometry" factory={curveGeometryStage} props={{format}}/><Layer source={ref('geometry')}/></Composition>;}
