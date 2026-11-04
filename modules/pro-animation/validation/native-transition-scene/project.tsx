/** @jsxImportSource @frameweave/engine */
import {Composition,Stage,Layer,ref,keyframes,linear709} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {createNativeTransitions,transitionNames} from '../../src/native-transitions/index.ts';
import {sourceKernel,atlasKernel,transparentKernel} from './fixture.ts';

/** 32 different native transitions, in named row-major order. Source code entry
 * pending Main's formal R1 named export; does not borrow a private module Store. */
export const transitions=defineNativeStage(async init=>{
 const {gpu}=init,fx=createNativeTransitions(init),source=await gpu.compile(sourceKernel),stamp=await gpu.compile(atlasKernel),blank=await gpu.compile(transparentKernel);
 const progress=keyframes([{frame:0,value:0},{frame:23,value:1,easing:'easeInOut'}]);
 const veil=keyframes([{frame:0,value:0},{frame:11,value:.04},{frame:23,value:0}]);
 return {async renderAt(context,_inputs,props:{format?:'rgba16float'|'rgba32float'}){
  const format=props.format??'rgba32float',tileWidth=Math.floor(init.width/8),tileHeight=Math.floor(init.height/4);
  const output={width:tileWidth,height:tileHeight,format,alpha:'premultiplied' as const,color:linear709};
  const parameters=new Float32Array([0,context.time]);
  const from=await gpu.run(source,[],{parameters,output});new Uint32Array(parameters.buffer)[0]=1;
  const to=await gpu.run(source,[],{parameters,output});new Uint32Array(parameters.buffer)[0]=2;
  // Alpha and RGB are explicit independent mask channels, not a data-buffer disguise.
  const mask=await gpu.run(source,[],{parameters,output:{...output,alpha:'straight'}});
  let atlas=await gpu.run(blank,[],{output:{...output,width:init.width,height:init.height}});
  for(let i=0;i<transitionNames.length;i++){
   const name=transitionNames[i];const f=fx[name] as (...args:any[])=>Promise<import('../../../gpu-effects/pixel-types.ts').GpuPixelImage>;
   const options={progress,format};
   const tile=['lumaWipe','alphaWipe','displacementTransition','glassWipe','imageWipe','warpTransition'].includes(name)?await f(from,to,mask,options,context):await f(from,to,options,context);
   // A second ordinary transition composes directly on the same resident scope.
   const finished=await fx.crossDissolve(tile,to,{progress:veil,format},context);
   const next=await gpu.run(stamp,[atlas,finished],{parameters:Uint32Array.of((i%8)*tileWidth,Math.floor(i/8)*tileHeight)});
   await gpu.release(atlas);await gpu.release(tile);await gpu.release(finished);atlas=next;
  }
  await gpu.release(from);await gpu.release(to);await gpu.release(mask);return atlas;
 }};
});
export default <Composition width={1280} height={360} fps={24} durationInFrames={24} background="transparent">
 <Stage id="transitions" factory={transitions} props={{format:'rgba32float'}}/>
 <Layer source={ref('transitions')} opacity={.92}/>
</Composition>;
