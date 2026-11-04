/** @jsxImportSource @frameweave/engine */
import {Composition,Stage,Layer,ref,linear709} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {createGpuPixelEffects} from '../../../gpu-effects/pixel-effects.ts';
import {withGpuResources} from '../../../gpu-effects/resource-arena.ts';
import {createNativePaImageEffects} from '../../../native-effects/pa/filters.ts';
import {createNativeTimeEffects} from '../../src/native-time/index.ts';
import {motionDisplays,motionGeometry} from './motions.ts';

export const motionStage=defineNativeStage(async init=>{
 const g=init.gpu,displays=motionDisplays(),over=createGpuPixelEffects(g),time=createNativeTimeEffects(init),pa=createNativePaImageEffects(init),matrix=[2/init.width,0,0,0,0,-2/init.height,0,0,0,0,1,0,-1,1,0,1];
 const colors=[[-.25,3,1,.65],[2,.5,-.25,.7],[1,-.5,2.5,.8]] as const;
 return {async renderAt(context,_inputs,props:{format:'rgba16float'|'rgba32float';blur:boolean}){
  const current=motionGeometry(displays,context,init.width,init.height),all=Float32Array.from(current.groups.flatMap(v=>Array.from(v))),published=await g.createBuffer({type:'f32',length:all.length},all);await g.publishBuffer('vertices',published,{version:1});await g.releaseBuffer(published);
  const source=async(sample:{context:typeof context})=>withGpuResources(g,async arena=>{
   const geometry=motionGeometry(displays,sample.context,init.width,init.height);let result;
   for(let i=0;i<3;i++){
    const positions=arena.buffer(await g.createField({type:'f32',dimensions:[geometry.groups[i].length/3,1,1],components:3,semantic:'position',space:'image',units:'px'},geometry.groups[i])),image=arena.image(await g.drawMesh({positions,count:geometry.groups[i].length/3,matrix,color:colors[i],raster:{version:1,mode:'depth-peel'},output:{width:init.width,height:init.height,format:'rgba32float',color:linear709,alpha:'premultiplied'}}));
    result=result?arena.image(await over.over(image,result,{format:'rgba32float'})):image;
   }
   return arena.keep(result!);
  });
  const image=props.blur?await time.shutterBlur(source,{count:8,angleDegrees:270,format:props.format},context):await time.retime(source,{format:props.format},context);
  try{const final=await pa.processImage(image,(i,fx)=>fx.glow(i,{radius:1.5,intensity:.12,threshold:.5,format:props.format}),{context}),pixels=await g.imageToBuffer!(final,{version:1});await g.publishBuffer('pixels',pixels,{version:1});await g.releaseBuffer(pixels);return final;}finally{await g.release(image);}
 },async dispose(){await pa.dispose();}};
});
export function motionScene(format:'rgba16float'|'rgba32float',blur=true){return <Composition width={600} height={400} fps={24} durationInFrames={48} background="transparent"><Stage id="motion" factory={motionStage} props={{format,blur}}/><Layer source={ref('motion')}/></Composition>;}
