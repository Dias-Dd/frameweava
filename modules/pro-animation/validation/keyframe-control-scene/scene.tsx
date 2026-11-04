/** @jsxImportSource @frameweave/engine */
import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {createNativePaImageEffects} from '../../../native-effects/pa/filters.ts';
import {createNativeTimeEffects} from '../../src/native-time/index.ts';
import {drawPathMesh} from '../../src/path-authoring/native.ts';
import {solidStrokeInk,type PreparedStrokeMesh} from '../../src/stroke-animation/index.ts';
import {sourceTimeContext} from '../../src/native-time/plans.ts';
import {controlsAt,sourceSeconds,type Mode} from './controls.ts';
const mesh:PreparedStrokeMesh={coordinates:{spaceId:'canvas',unit:'px',origin:'top-left',x:'right',y:'down',width:320,height:180},closed:false,positions:[-12,-10,.5,12,-10,.5,12,10,.5,-12,-10,.5,12,10,.5,-12,10,.5],parameters:[0,0,0,0,0,0],diagnostics:[],preparation:{faces:1,triangles:2,maxAreaDeviation:0,roundTolerance:.02,gridSize:.0025,sampleCount:0}};
export const keyframeControlStage=defineNativeStage(async init=>{
 const g=init.gpu,time=createNativeTimeEffects(init),pa=createNativePaImageEffects(init),ink=solidStrokeInk([-.25,6,10,.8]);
 return {async renderAt(context,_inputs,props:{mode:Mode;format:'rgba16float'|'rgba32float'}){
 const trace=controlsAt(context),samples:object[]=[];let image;
 try{
 image=await time.shutterBlur(async sample=>{
  const seconds=sourceSeconds(props.mode,sample.context),c=sourceTimeContext(sample.context,seconds),x=40+210*seconds;samples.push({index:sample.index,shutter:sample.context,source:c,x});
  return drawPathMesh(init,mesh,c,{ink,position:[x,90],format:'rgba32float'});
 },{count:8,angleDegrees:720,format:props.format},context);
 const raw=await g.imageToBuffer!(image,{version:1});await g.publishBuffer('basePixels',raw,{version:1});await g.releaseBuffer(raw);
 const json=JSON.stringify({controls:trace,samples}),words=Uint32Array.from({length:json.length},(_,i)=>json.charCodeAt(i)),buffer=await g.createBuffer({type:'u32',length:words.length},words);await g.publishBuffer('trace',buffer,{version:1});await g.releaseBuffer(buffer);
 const final=await pa.processImage(image,(i,fx)=>fx.glow(i,{radius:1.1,intensity:.1,threshold:.5,format:props.format}),{context}),pixels=await g.imageToBuffer!(final,{version:1});await g.publishBuffer('pixels',pixels,{version:1});await g.releaseBuffer(pixels);return final;
 }finally{if(image)await g.release(image);}
 },async dispose(){await pa.dispose();}};
});
export function keyframeControlScene(format:'rgba16float'|'rgba32float'){return <Composition width={640} height={360} fps={24} durationInFrames={8} background="transparent">
 <Stage id="offset" width={320} height={180} factory={keyframeControlStage} props={{mode:'offset',format}}/>
 <Stage id="ping" width={320} height={180} factory={keyframeControlStage} props={{mode:'ping-pong',format}}/>
 <Stage id="continue" width={320} height={180} factory={keyframeControlStage} props={{mode:'continue',format}}/>
 <Stage id="inverse" width={320} height={180} factory={keyframeControlStage} props={{mode:'inverse',format}}/>
 <Layer source={ref('offset')}/><Layer source={ref('ping')} x={320}/><Layer source={ref('continue')} y={180}/><Layer source={ref('inverse')} x={320} y={180}/>
 </Composition>;}
