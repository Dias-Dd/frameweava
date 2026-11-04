import {Composition,Stage,Layer,ref,keyframes} from '@frameweave/engine';
import {defineMediaStage,surfaceFromPixels,linear709} from '@frameweave/engine/native';
import {add,exposure,gpuImageStats} from 'test.gpu-images';
import type {ProfessionalSurface} from '@frameweave/engine';
export const warm=defineMediaStage(init=>({renderAt(ctx){
 const p=new Float32Array(init.width*init.height*4),cx=init.width*(.3+.2*ctx.progress);
 for(let y=0;y<init.height;y++)for(let x=0;x<init.width;x++){const a=(x-cx)**2+(y-init.height*.5)**2<22**2?.8:0;p.set([4*a,.9*a,-.1*a,a],(y*init.width+x)*4);}
 return {surface:surfaceFromPixels(init.width,init.height,p,{format:'rgba32float',color:linear709,alpha:'premultiplied'})};
}}));
export const cool=defineMediaStage(init=>({async renderAt(ctx){
 const p=new Float32Array(init.width*init.height*4),cx=init.width*(.65-.1*ctx.progress);
 for(let y=0;y<init.height;y++)for(let x=0;x<init.width;x++){const a=(x-cx)**2+(y-init.height*.5)**2<20**2?.65:0;p.set([.2*a,1.5*a,3*a,a],(y*init.width+x)*4);}
 const source=surfaceFromPixels(init.width,init.height,p,{format:'rgba32float',color:linear709,alpha:'premultiplied'});
 return {surface:await exposure(source,{stops:keyframes([{frame:0,value:-1},{frame:2,value:1}])},ctx),stats:gpuImageStats()};
}}));
export const sum=defineMediaStage(()=>({async renderAt(ctx,inputs:{first:ProfessionalSurface;second:ProfessionalSurface}){
 return {surface:await add(inputs.first,inputs.second,{},ctx),stats:gpuImageStats()};
}}));
export default <Composition width={160} height={90} fps={12} durationInFrames={3} background="#000000"><Stage id="first" factory={warm} outputs={{surface:'surface'}}/><Stage id="second" factory={cool} outputs={{surface:'surface',stats:'json'}}/><Stage id="image" factory={sum} inputs={{first:ref('first'),second:ref('second')}} outputs={{surface:'surface',stats:'json'}}/><Layer source={ref('image')}/></Composition>;
