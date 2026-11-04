import {Composition,Stage,Layer,ref,keyframes} from '@frameweave/engine';
import {defineMediaStage,surfaceFromPixels,linear709} from '@frameweave/engine/native';
import {processImage,imageStats} from 'gpu-resident-effects';
import type {ProfessionalSurface} from '@frameweave/engine';
// Procedural input fixtures, not a CPU implementation of the cleanup filters.
function paint(width:number,height:number,progress:number,mode:'color'|'mask'|'original'){
 const p=new Float32Array(width*height*4),cx=width*(.4+.2*progress);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const body=(x-cx)**2+(y-45)**2<24**2,hole=Math.abs(x-cx)<2&&Math.abs(y-45)<2,spot=(x===12&&y===12)||(x===140&&y===73),a=spot||body&&!hole?1:0,at=(y*width+x)*4;
  p.set(mode==='color'?[2+.005*x,.3+.003*y,-.08,1]:mode==='mask'?[0,0,0,a]:[(2+.005*x)*a,(.3+.003*y)*a,-.08*a,a],at);
 }return surfaceFromPixels(width,height,p,{format:'rgba32float',color:linear709,alpha:mode==='color'?'opaque':'premultiplied'});
}
// Each Web Stage keeps the existing single-Surface output contract.
export const color=defineMediaStage(init=>({renderAt(ctx){return {surface:paint(init.width,init.height,ctx.progress,'color')};}}));
export const mask=defineMediaStage(init=>({renderAt(ctx){return {surface:paint(init.width,init.height,ctx.progress,'mask')};}}));
export const original=defineMediaStage(init=>({renderAt(ctx){return {surface:paint(init.width,init.height,ctx.progress,'original')};}}));
export const apply=defineMediaStage(()=>({async renderAt(ctx,inputs:{image:ProfessionalSurface;mask:ProfessionalSurface}){
 const surface=await processImage(inputs.image,async(image,fx)=>{
  const mask=await fx.importImage(inputs.mask);let alpha=await fx.extractMatte(mask);
  alpha=await fx.morphology(alpha,{operation:'open',radius:1});
  alpha=await fx.morphology(alpha,{operation:'close',radius:2});
  alpha=await fx.featherMatte(alpha,{radius:1.1});
  alpha=await fx.matteLevels(alpha,{black:keyframes([{frame:0,value:.1},{frame:2,value:.2}]),white:.85});
  return fx.applyMatte(image,alpha);
 },{context:ctx});return {surface,stats:imageStats()};
}}));
export default <Composition width={160} height={90} fps={12} durationInFrames={3} background="#172844"><Stage id="source" factory={color} outputs={{surface:'surface'}}/><Stage id="mask" factory={mask} outputs={{surface:'surface'}}/><Stage id="original" factory={original} outputs={{surface:'surface'}}/><Stage id="image" factory={apply} inputs={{image:ref('source'),mask:ref('mask')}} outputs={{surface:'surface',stats:'json'}}/><Layer source={ref('original')} scale={.5} y={22.5}/><Layer source={ref('image')} scale={.5} x={80} y={22.5}/></Composition>;
