import {Composition,Stage,Layer,ref,keyframes} from '@frameweave/engine';
import {defineMediaStage,surfaceFromPixels,linear709} from '@frameweave/engine/native';
import {fill,over,gpuImageStats} from 'test.gpu-images';
import type {ProfessionalSurface} from '@frameweave/engine';
export const foreground=defineMediaStage(init=>({async renderAt(ctx){
 const p=new Float32Array(init.width*init.height*4),cx=init.width*(.3+.2*ctx.progress);
 for(let y=0;y<init.height;y++)for(let x=0;x<init.width;x++)p[(y*init.width+x)*4+3]=(x-cx)**2+(y-init.height*.5)**2<22**2?.75:0;
 const mask=surfaceFromPixels(init.width,init.height,p,{format:'rgba32float',color:linear709,alpha:'premultiplied'});
 return {surface:await fill(mask,{color:[4,.3,-.1]},ctx),stats:gpuImageStats()};
}}));
export const background=defineMediaStage(init=>({renderAt(){
 const p=new Float32Array(init.width*init.height*4);for(let y=0;y<init.height;y++)for(let x=0;x<init.width;x++)p.set([-.1,.3+.001*y,1.5,1],(y*init.width+x)*4);
 return {surface:surfaceFromPixels(init.width,init.height,p,{format:'rgba32float',color:linear709,alpha:'premultiplied'})};
}}));
export const composite=defineMediaStage(()=>({async renderAt(ctx,inputs:{foreground:ProfessionalSurface;background:ProfessionalSurface}){
 return {surface:await over(inputs.foreground,inputs.background,{opacity:keyframes([{frame:0,value:.25},{frame:2,value:.9}])},ctx),stats:gpuImageStats()};
}}));
export default <Composition width={160} height={90} fps={12} durationInFrames={3} background="#000000"><Stage id="front" factory={foreground} outputs={{surface:'surface',stats:'json'}}/><Stage id="back" factory={background} outputs={{surface:'surface'}}/><Stage id="image" factory={composite} inputs={{foreground:ref('front'),background:ref('back')}} outputs={{surface:'surface',stats:'json'}}/><Layer source={ref('back')} scale={.5} y={22.5}/><Layer source={ref('image')} scale={.5} x={80} y={22.5}/></Composition>;
