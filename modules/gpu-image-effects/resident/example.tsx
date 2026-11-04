import {Composition,Stage,Layer,ref,keyframes} from '@frameweave/engine';
import {defineMediaStage,surfaceFromPixels,linear709} from '@frameweave/engine/native';
import {processImage,imageStats} from 'gpu-resident-effects';
import type {ProfessionalSurface} from '@frameweave/engine';
export const source=defineMediaStage(init=>({renderAt(ctx){
 const p=new Float32Array(init.width*init.height*4),cx=init.width*(.35+.3*ctx.progress);
 for(let y=0;y<init.height;y++)for(let x=0;x<init.width;x++){const inside=(x-cx)**2+(y-init.height*.5)**2<22**2;p.set(inside?[2+.006*x,.4+.002*y,-.05,1]:[0,1,0,1],(y*init.width+x)*4);}
 return {surface:surfaceFromPixels(init.width,init.height,p,{format:'rgba32float',color:linear709,alpha:'straight'})};
}}));
export const graded=defineMediaStage(()=>({async renderAt(ctx,inputs:{image:ProfessionalSurface}){
 const surface=await processImage(inputs.image,async(image,fx)=>{
  let next=await fx.chromaKey(image,{inner:.05,outer:.2});
  next=await fx.despill(next,{channel:'green',amount:.5});
  next=await fx.levels(next,{gamma:[1,1,1],outputWhite:[keyframes([{frame:0,value:.9},{frame:2,value:1.1}]),1,1]});
  next=await fx.curves(next,{red:[[0,0],[.5,.55],[1,1]],green:[[0,0],[1,1]],blue:[[0,0],[1,1]]});
  next=await fx.channelMix(next,{matrix:[[1,.05,0],[0,1,0],[0,0,1]]});
  next=await fx.lumaKey(next,{low:.01,high:.05});
  return fx.unsharpMask(next,{radius:1.25,amount:.5,boundary:'clamp'});
 },{context:ctx});return {surface,stats:imageStats()};
}}));
export default <Composition width={160} height={90} fps={12} durationInFrames={3} background="#172844"><Stage id="source" factory={source} outputs={{surface:'surface'}}/><Stage id="image" factory={graded} inputs={{image:ref('source')}} outputs={{surface:'surface',stats:'json'}}/><Layer source={ref('source')} scale={.5} y={22.5}/><Layer source={ref('image')} scale={.5} x={80} y={22.5}/></Composition>;
