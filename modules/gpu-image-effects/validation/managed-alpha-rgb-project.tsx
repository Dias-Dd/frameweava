import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {defineMediaStage,surfaceFromPixels,linear709} from '@frameweave/engine/native';
import {fill,feather,applyMatte,mergeMatte,alphaToRGB,gpuImageStats} from 'test.gpu-images';
import type {ProfessionalSurface} from '@frameweave/engine';
export const picture=defineMediaStage(init=>({async renderAt(ctx){
 const image=new Float32Array(init.width*init.height*4),maskA=new Float32Array(image.length),maskB=new Float32Array(image.length),cx=init.width*(.3+.2*ctx.progress),cy=init.height*.5;
 for(let y=0;y<init.height;y++)for(let x=0;x<init.width;x++){const i=(y*init.width+x)*4;image.set([2,-.2,1,.85],i);maskA[i+3]=(x-cx)**2+(y-cy)**2<18**2?1:0;maskB[i+3]=(x-102)**2+(y-53)**2<15**2?.65:0;}
 const source=surfaceFromPixels(init.width,init.height,image,{format:'rgba32float',color:linear709,alpha:'straight'}),first=surfaceFromPixels(init.width,init.height,maskA,{format:'rgba32float',color:linear709,alpha:'premultiplied'}),second=surfaceFromPixels(init.width,init.height,maskB,{format:'rgba32float',color:linear709,alpha:'premultiplied'});
 const colored=await fill(source,{color:[4,.75,-.1],alpha:'premultiplied'},ctx),softA=await feather(first,{radius:1.25},ctx),softB=await feather(second,{radius:2},ctx),combined=await mergeMatte(softA,softB,{},ctx),surface=await applyMatte(colored,combined,{opacity:.8},ctx);
 return {surface,stats:gpuImageStats()};
}}));
export const channelView=defineMediaStage(()=>({async renderAt(ctx,inputs:{image:ProfessionalSurface}){
 const surface=await alphaToRGB(inputs.image,{},ctx);return {surface,stats:gpuImageStats()};
}}));
export default <Composition width={160} height={90} fps={12} durationInFrames={3} background="#061b24"><Stage id="image" factory={picture} outputs={{surface:'surface',stats:'json'}}/><Stage id="matteView" factory={channelView} inputs={{image:ref('image')}} outputs={{surface:'surface',stats:'json'}}/><Layer source={ref('image')} scale={.5} y={22.5}/><Layer source={ref('matteView')} scale={.5} x={80} y={22.5}/></Composition>;
