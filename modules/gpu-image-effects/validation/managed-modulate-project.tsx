import {Composition,Stage,Layer,ref,keyframes} from '@frameweave/engine';
import {defineMediaStage,surfaceFromPixels,linear709} from '@frameweave/engine/native';
import {modulate,exposure,gpuImageStats} from 'test.gpu-images';
import type {ProfessionalSurface} from '@frameweave/engine';
// Shot-specific content generation, not a CPU implementation of the effect.
export const source=defineMediaStage(init=>({renderAt(){
 const p=new Float32Array(init.width*init.height*4);
 for(let y=0;y<init.height;y++)for(let x=0;x<init.width;x++){
  const a=x>=16&&x<144&&y>=10&&y<80?.5:0;
  p.set([(4+.01*x)*a,(1.25+.002*y)*a,(-.1-.001*x)*a,a],(y*init.width+x)*4);
 }
 return {surface:surfaceFromPixels(init.width,init.height,p,{format:'rgba32float',color:linear709,alpha:'premultiplied'})};
}}));
export const gainMap=defineMediaStage(init=>({async renderAt(ctx){
 const p=new Float32Array(init.width*init.height*4);
 for(let y=0;y<init.height;y++)for(let x=0;x<init.width;x++)p.set([.05+1.2*x/159,-.1+.8*y/89,-4,0],(y*init.width+x)*4);
 const raw=surfaceFromPixels(init.width,init.height,p,{format:'rgba32float',color:linear709,alpha:'premultiplied'});
 return {surface:await exposure(raw,{stops:keyframes([{frame:0,value:-1},{frame:2,value:1}])},ctx),stats:gpuImageStats()};
}}));
export const image=defineMediaStage(()=>({async renderAt(ctx,inputs:{source:ProfessionalSurface;gains:ProfessionalSurface}){
 return {surface:await modulate(inputs.source,inputs.gains,{},ctx),stats:gpuImageStats()};
}}));
export default <Composition width={160} height={90} fps={12} durationInFrames={3} background="#000000"><Stage id="source" factory={source} outputs={{surface:'surface'}}/><Stage id="gains" factory={gainMap} outputs={{surface:'surface',stats:'json'}}/><Stage id="image" factory={image} inputs={{source:ref('source'),gains:ref('gains')}} outputs={{surface:'surface',stats:'json'}}/><Layer source={ref('source')} scale={.5} y={22.5}/><Layer source={ref('image')} scale={.5} x={80} y={22.5}/></Composition>;
