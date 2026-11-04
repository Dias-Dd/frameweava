/** @jsxImportSource @frameweave/engine */
import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {EngineError} from '../../../../src/core/errors.ts';
import type {NativeGpuScope} from '../../../native-gpu/authoring.ts';
import {createNativePaImageEffects} from '../../../native-effects/pa/filters.ts';
import {solidStrokeInk} from '../../src/stroke-animation/index.ts';
import {drawPathMesh} from '../../src/path-authoring/index.ts';
import {prepared} from './prepared.ts';
import {authoringCases} from './cases.ts';
import {inkAlpha,pathWords} from './animation.ts';
export const pathStage=defineNativeStage(async init=>{
 const g=init.gpu,observed=new Proxy(g,{get(target,key){if(key==='drawMesh')return async(o:Parameters<NativeGpuScope['drawMesh']>[0])=>{const image=await target.drawMesh(o);await g.publishBuffer('geometry',o.positions,{version:1});const palette=await g.imageToBuffer!(o.texture!.image,{version:1});await g.publishBuffer('palette',palette,{version:1});await g.releaseBuffer(palette);return image;};const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}}),pa=createNativePaImageEffects(init),ink=solidStrokeInk([-.12,.65,2.2,inkAlpha]);
 return {async renderAt(context,_inputs,props:{format:'rgba16float'|'rgba32float'}){
  if(!Number.isSafeInteger(context.frame)||context.frame<0||context.frame>=prepared.length)throw new EngineError('E_PA_PATH_DEMO_RANGE','This explicit finite precompute contains integer frames0..7, not a continuous geometry sampler');
  // Execute all23 named generators inside the real Stage too; compare their live
  // control words with Node in the test. No CPU raster or hidden tessellation here.
  const words=pathWords(authoringCases(context)),pairs=new Float32Array(words.length*2);for(const [i,x]of words.entries()){pairs[i*2]=Math.fround(x);pairs[i*2+1]=Math.fround(x-pairs[i*2]);}const authored=await g.createBuffer({type:'f32',length:pairs.length},pairs);await g.publishBuffer('authored',authored,{version:1});await g.releaseBuffer(authored);
  const image=await drawPathMesh({...init,gpu:observed},prepared[context.frame],context,{ink,opacity:.9,format:props.format});try{const final=await pa.processImage(image,(i,fx)=>fx.glow(i,{radius:1.25,intensity:.1,threshold:.5,format:props.format}),{context}),pixels=await g.imageToBuffer!(final,{version:1});await g.publishBuffer('pixels',pixels,{version:1});await g.releaseBuffer(pixels);return final;}finally{await g.release(image);}
 },async dispose(){await pa.dispose();}};
});
export function pathAuthoringScene(format:'rgba16float'|'rgba32float'){return <Composition width={640} height={480} fps={24} durationInFrames={8} background="transparent"><Stage id="curves" factory={pathStage} props={{format}}/><Layer source={ref('curves')}/></Composition>;}
