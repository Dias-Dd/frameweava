import {Composition,Stage,Layer,ref,keyframes} from '@frameweave/engine';
import {defineMediaStage,surfaceFromPixels,linear709} from '@frameweave/engine/native';
import {processImage,imageStats} from 'test.resident-creative';
import type {ProfessionalSurface} from '@frameweave/engine';
export const source=defineMediaStage(init=>({renderAt(ctx){
 const p=new Float32Array(init.width*init.height*4);
 for(let y=0;y<init.height;y++)for(let x=0;x<init.width;x++){
  const u=x/(init.width-1),v=y/(init.height-1),wave=.2*Math.sin((x+ctx.frame*3)/11),disk=(x-init.width*(.35+.1*ctx.progress))**2+(y-init.height*.5)**2<18**2;
  p.set([1.5+1.8*u+(disk?.8:0),.2+.7*v+wave,-.5+.15*u,1],(y*init.width+x)*4);
 }return {surface:surfaceFromPixels(init.width,init.height,p,{format:'rgba32float',color:linear709,alpha:'opaque'})};
}}));
export const artwork=defineMediaStage(()=>({async renderAt(ctx,inputs:{image:ProfessionalSurface}){
 const surface=await processImage(inputs.image,async(image,fx)=>{
  let n=await fx.brightnessContrast(image,{brightness:.025,contrast:keyframes([{frame:0,value:.95},{frame:2,value:1.05}])});
  n=await fx.colorBalance(n,{shadows:[.1,0,-.05],midtones:[0,.04,-.03],highlights:[.03,-.02,0]});
  n=await fx.blackAndWhite(n,{amount:.08});
  n=await fx.tint(n,{black:[-.05,.02,.06],white:[1.1,.85,.55],amount:.1});
  n=await fx.tritone(n,{shadows:[-.02,.01,.04],midtones:[.6,.4,.15],highlights:[1.2,.9,.5],amount:.1});
  n=await fx.filmGrain(n,{amount:.012,seed:37,colored:true});
  n=await fx.vignette(n,{amount:.35,radius:.6});
  n=await fx.pixelate(n,{blockSize:[3,3]});
  n=await fx.reliefLighting(n,n,{contrast:.015,angle:35});
  return fx.sobelEdges(n,{strength:.08,color:[1,.5,.15],mode:'overlay'});
 },{context:ctx});return {surface,stats:imageStats()};
}}));
export default <Composition width={192} height={108} fps={12} durationInFrames={3} background="#172844"><Stage id="source" factory={source} outputs={{surface:'surface'}}/><Stage id="image" factory={artwork} inputs={{image:ref('source')}} outputs={{surface:'surface',stats:'json'}}/><Layer source={ref('source')} scale={.5} y={27}/><Layer source={ref('image')} scale={.5} x={96} y={27}/></Composition>;
