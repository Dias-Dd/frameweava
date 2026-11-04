/** @jsxImportSource @frameweave/engine */
import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {EngineError} from '../../../../src/core/errors.ts';
import type {NativeGpuScope} from '../../../native-gpu/authoring.ts';
import {createNativePaImageEffects} from '../../../native-effects/pa/filters.ts';
import {drawPathFill} from '../../src/smart-path/fill.ts';
import {prepared} from './prepared.ts';
import {inkOpacity,xShift,inkColor} from './animation.ts';
export const smartMorphStage=defineNativeStage(async init=>{
 const g=init.gpu,observed=new Proxy(g,{get(target,key){if(key==='drawMesh')return async(o:Parameters<NativeGpuScope['drawMesh']>[0])=>{const image=await target.drawMesh(o);await g.publishBuffer('geometry',o.positions,{version:1});const matrix=await g.createBuffer({type:'f32',length:o.matrix!.length},Float32Array.from(o.matrix!));await g.publishBuffer('matrix',matrix,{version:1});await g.releaseBuffer(matrix);const palette=await g.imageToBuffer!(o.texture!.image,{version:1});await g.publishBuffer('palette',palette,{version:1});await g.releaseBuffer(palette);return image;};const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}}),pa=createNativePaImageEffects(init);
 return {async renderAt(context,_inputs,props:{format:'rgba16float'|'rgba32float'}){
  if(!Number.isSafeInteger(context.frame)||context.frame<0||context.frame>=prepared.length)throw new EngineError('E_PA_MORPH_DEMO_RANGE','Finite original-Rust geometry preparation covers integer frames0..7; regenerate it after editing cases');
  const mesh=prepared[context.frame],image=await drawPathFill({...init,gpu:observed},mesh,context,{color:inkColor,opacity:inkOpacity,position:[xShift,0],format:props.format});
  try{const final=await pa.processImage(image,(i,fx)=>fx.glow(i,{radius:1.1,intensity:.1,threshold:.5,format:props.format}),{context}),pixels=await g.imageToBuffer!(final,{version:1});await g.publishBuffer('pixels',pixels,{version:1});await g.releaseBuffer(pixels);return final;}finally{await g.release(image);}
 },async dispose(){await pa.dispose();}};
});
export function smartMorphScene(format:'rgba16float'|'rgba32float'){return <Composition width={640} height={400} fps={24} durationInFrames={8} background="transparent"><Stage id="morph" factory={smartMorphStage} props={{format}}/><Layer source={ref('morph')}/></Composition>;}
