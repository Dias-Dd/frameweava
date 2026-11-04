/** @jsxImportSource @frameweave/engine */
import {Composition,Stage,Layer,Resource,ref,linear709,keyframes} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {processPa} from 'native-image-effects';
import {createNativeTransitions,type CardCamera} from '../../src/native-transitions/index.ts';

export const cards=defineNativeStage(async init=>{
 const g=init.gpu,fx=createNativeTransitions(init),progress=keyframes([{frame:0,value:0},{frame:23,value:1,easing:'easeInOut'}]);
 return {async renderAt(context,_inputs,props:{format:'rgba16float'|'rgba32float';camera:'position'|'corner-pins'|'composition';backside?:'image'|'none'}){
  const source={width:80,height:45,format:props.format,alpha:'premultiplied' as const,color:linear709};
  const a=await g.importResource({version:1,id:'front',decode:'icc-sdr',output:source}),b=await g.importResource({version:1,id:'back',decode:'surface-v2',output:source});
  // Ordinary creative camera values; no GPU-brand/implementation selection.
  const camera:CardCamera=props.camera==='corner-pins'?{system:'corner-pins',corners:[[.08,.12],[.92,.08],[.86,.9],[.13,.86]],autoFocalLength:false,focalLength:960}:props.camera==='composition'?{system:'composition',projection:[960,0,240,0,0,960,135,0,0,0,1,960]}:{system:'position',rotationDegrees:[8,20,-3],depth:960,focalLength:960,transformOrder:'XYZ-position'};
  const image=await fx.cardFlipWipe(a,b,{
   geometry:'mesh',progress,format:props.format,rows:3,columns:4,cardScale:1.25,transitionWidth:.6,
   axis:'random',flipDirection:'random',order:'top-left',timingRandomness:.2,seed:37,camera,
   positionJitter:{amount:[10,5,36],speed:[.4,.6,.3]},rotationJitter:{amount:[10,15,8],speed:[.5,.7,.2]},
   lighting:props.camera==='composition'?{type:'composition',composition:{kind:'point',position:[96,40.5,-650],color:[.6,.9,1.4],intensity:1.1},ambient:.24}:{type:'point',position:[.2,.15],depth:650,color:[.6,.9,1.4],intensity:1.1,ambient:.24},
   material:{diffuse:.8,specular:.35,highlightSharpness:24},backside:props.backside??'image',
  },context);
  const final=await processPa(image,(input,f)=>f.glow(input,{radius:2,intensity:.18,threshold:.4,format:props.format}),{context});
  await g.release(a);await g.release(b);await g.release(image);
  const view=await g.imageToBuffer!(final,{version:1});await g.publishBuffer('result',view,{version:1});await g.releaseBuffer(view);return final;
 }};
});
export function cardScene(format:'rgba16float'|'rgba32float',camera:'position'|'corner-pins'|'composition'='position',backside:'image'|'none'='image'){
 return <Composition width={480} height={270} fps={24} durationInFrames={24} background="transparent">
  <Resource id="front" src="./assets/source.png" kind="image"/><Resource id="back" src="./assets/source.surface.json" kind="file"/>
  <Stage id="cards" factory={cards} props={{format,camera,backside}}/><Layer source={ref('cards')} opacity={.92}/>
 </Composition>;
}
