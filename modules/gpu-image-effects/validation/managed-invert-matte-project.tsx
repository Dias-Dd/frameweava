import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {defineMediaStage,surfaceFromPixels,linear709} from '@frameweave/engine/native';
import {invertMatte,feather,applyMatte,gpuImageStats} from 'test.gpu-images';
import type {ProfessionalSurface} from '@frameweave/engine';
export const mask=defineMediaStage(init=>({renderAt(ctx){
 const p=new Float32Array(init.width*init.height*4),cx=init.width*(.3+.2*ctx.progress);
 for(let y=0;y<init.height;y++)for(let x=0;x<init.width;x++)p.set([3e30,-3e30,.5,(x-cx)**2+(y-init.height*.5)**2<22**2?1:0],(y*init.width+x)*4);
 return {surface:surfaceFromPixels(init.width,init.height,p,{format:'rgba32float',color:linear709,alpha:'premultiplied'})};
}}));
export const inverse=defineMediaStage(()=>({async renderAt(ctx,inputs:{mask:ProfessionalSurface}){
 return {surface:await invertMatte(inputs.mask,{},ctx),stats:gpuImageStats()};
}}));
export const soft=defineMediaStage(()=>({async renderAt(ctx,inputs:{mask:ProfessionalSurface}){
 return {surface:await feather(inputs.mask,{radius:1.25,boundary:'clamp'},ctx),stats:gpuImageStats()};
}}));
export const cutout=defineMediaStage(init=>({async renderAt(ctx,inputs:{mask:ProfessionalSurface}){
 const p=new Float32Array(init.width*init.height*4);for(let i=0;i<p.length;i+=4)p.set([4,.75,-.1,1],i);
 const image=surfaceFromPixels(init.width,init.height,p,{format:'rgba32float',color:linear709,alpha:'opaque'});
 return {surface:await applyMatte(image,inputs.mask,{},ctx),stats:gpuImageStats()};
}}));
export default <Composition width={160} height={90} fps={12} durationInFrames={3} background="#000000"><Stage id="mask" factory={mask} outputs={{surface:'surface'}}/><Stage id="inverse" factory={inverse} inputs={{mask:ref('mask')}} outputs={{surface:'surface',stats:'json'}}/><Stage id="soft" factory={soft} inputs={{mask:ref('inverse')}} outputs={{surface:'surface',stats:'json'}}/><Stage id="image" factory={cutout} inputs={{mask:ref('soft')}} outputs={{surface:'surface',stats:'json'}}/><Layer source={ref('image')}/></Composition>;
