/** @jsxImportSource @frameweave/engine */
import {Composition,Stage,Layer,Resource,ref,linear709,keyframes} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {createNativePaImageEffects} from '../../../native-effects/pa/filters.ts';
import {createNativeTimeEffects} from '../../src/native-time/index.ts';
import {movingSource} from './source.ts';

export const temporalStage=defineNativeStage(async init=>{
 const g=init.gpu,time=createNativeTimeEffects(init),pa=createNativePaImageEffects(init),ramp=keyframes([{frame:0,value:0},{frame:23,value:1,easing:'easeInOut'}]);
 return {async renderAt(context,_inputs,props:{mode:'retime'|'echo'|'shutter'|'wide';format:'rgba16float'|'rgba32float'}){
  const ink=await g.importResource({version:1,id:'ink',decode:'surface-v2',output:{width:80,height:45,color:linear709,format:'rgba32float',alpha:'premultiplied'}});
  let image;
  try{
   const source=await movingSource(g,ink,init.width,init.height),base={format:props.format,range:{start:0,end:1,boundary:'transparent' as const}};
   if(props.mode==='retime')image=await time.retime(source,{...base,time:ramp},context);
   else if(props.mode==='echo')image=await time.echo(source,{...base,time:ramp,echoes:7,interval:-.055,intensity:1,decay:.8,mode:'in-front'},context);
   else if(props.mode==='shutter')image=await time.shutterBlur(source,{...base,count:16,angleDegrees:1440,sourceTime:ramp},context);
   else image=await time.wideTime(source,{...base,before:.15,after:.15,count:16,weight:'triangle'},context);
   const final=await pa.processImage(image,(i,fx)=>fx.glow(i,{radius:2,intensity:.16,threshold:.4,format:props.format}),{context});
   const view=await g.imageToBuffer!(final,{version:1});await g.publishBuffer('pixels',view,{version:1});await g.releaseBuffer(view);return final;
  }finally{await g.release(ink);if(image)await g.release(image);}
 },async dispose(){await pa.dispose();}};
});
export function temporalScene(format:'rgba16float'|'rgba32float'){
 return <Composition width={640} height={360} fps={24} durationInFrames={24} background="transparent">
  <Resource id="ink" src="./assets/source.surface.json" kind="file"/>
  <Stage id="exact" width={320} height={180} factory={temporalStage} props={{mode:'retime',format}}/>
  <Stage id="echo" width={320} height={180} factory={temporalStage} props={{mode:'echo',format}}/>
  <Stage id="shutter" width={320} height={180} factory={temporalStage} props={{mode:'shutter',format}}/>
  <Stage id="wide" width={320} height={180} factory={temporalStage} props={{mode:'wide',format}}/>
  <Layer source={ref('exact')}/>
  <Layer source={ref('echo')} x={320}/>
  <Layer source={ref('shutter')} y={180}/>
  <Layer source={ref('wide')} x={320} y={180}/>
 </Composition>;
}
