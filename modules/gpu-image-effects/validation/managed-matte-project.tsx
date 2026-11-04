import {Composition,Stage,Layer,ref,keyframes} from '@frameweave/engine';
import {defineMediaStage,surfaceFromPixels,linear709} from '@frameweave/engine/native';
import {fill,feather,applyMatte,dropShadow,gpuImageStats} from 'test.gpu-images';
import type {ProfessionalSurface} from '@frameweave/engine';
export const picture=defineMediaStage(init=>({async renderAt(ctx){
 const image=new Float32Array(init.width*init.height*4),mask=new Float32Array(image.length),cx=init.width*(.3+.2*ctx.progress),cy=init.height*.5;
 for(let y=0;y<init.height;y++)for(let x=0;x<init.width;x++){const i=(y*init.width+x)*4,inside=x>20&&x<120&&y>15&&y<75;image.set([2,-.2,1,inside?.85:0],i);mask[i+3]=(x-cx)**2+(y-cy)**2<18**2?1:0;}
 const source=surfaceFromPixels(init.width,init.height,image,{format:'rgba32float',color:linear709,alpha:'straight'}),hard=surfaceFromPixels(init.width,init.height,mask,{format:'rgba32float',color:linear709,alpha:'premultiplied'});
 const colored=await fill(source,{color:[4,.75,-.1],alpha:'premultiplied'},ctx);
 const soft=await feather(hard,{radius:keyframes([{frame:0,value:1.25},{frame:2,value:2}])},ctx);
 const surface=await applyMatte(colored,soft,{opacity:.8},ctx);
 return {surface,stats:gpuImageStats()};
}}));
export const shadowPicture=defineMediaStage(()=>({async renderAt(ctx,inputs:{image:ProfessionalSurface}){
 const surface=await dropShadow(inputs.image,{color:[.1,.3,3],opacity:.8,radius:3,offset:[keyframes([{frame:0,value:6.5},{frame:2,value:10.5}]),5.25]},ctx);
 return {surface,stats:gpuImageStats()};
}}));
export default <Composition width={160} height={90} fps={12} durationInFrames={3} background="#061b24"><Stage id="image" factory={picture} outputs={{surface:'surface',stats:'json'}}/><Stage id="shadow" factory={shadowPicture} inputs={{image:ref('image')}} outputs={{surface:'surface',stats:'json'}}/><Layer source={ref('shadow')}/><Layer source={ref('image')}/></Composition>;
