import {Composition,Stage,Layer,ref,keyframes,expr} from '@frameweave/engine';
import {defineMediaStage,surfaceFromPixels,linear709} from '@frameweave/engine/native';
import {offsetRGB,replaceMatte,feather,gpuImageStats} from 'test.gpu-images';
import type {ProfessionalSurface} from '@frameweave/engine';
export const source=defineMediaStage(init=>({renderAt(){
 const p=new Float32Array(init.width*init.height*4);for(let y=0;y<init.height;y++)for(let x=0;x<init.width;x++)p.set([4+.01*x,.4+.002*y,-.1-.001*x,x<80?.5:0],(y*init.width+x)*4);
 return {surface:surfaceFromPixels(init.width,init.height,p,{format:'rgba32float',color:linear709,alpha:'straight'})};
}}));
export const shifted=defineMediaStage(()=>({async renderAt(ctx,inputs:{image:ProfessionalSurface}){
 return {surface:await offsetRGB(inputs.image,{offset:[keyframes([{frame:0,value:-.25},{frame:2,value:.75}]),expr.mul(expr.frame,.25),.5]},ctx),stats:gpuImageStats()};
}}));
export const mask=defineMediaStage(init=>({async renderAt(ctx){
 const p=new Float32Array(init.width*init.height*4),cx=init.width*(.5+.2*ctx.progress);for(let y=0;y<init.height;y++)for(let x=0;x<init.width;x++)p[(y*init.width+x)*4+3]=(x-cx)**2+(y-init.height*.5)**2<22**2?.75:0;
 const raw=surfaceFromPixels(init.width,init.height,p,{format:'rgba32float',color:linear709,alpha:'premultiplied'});return {surface:await feather(raw,{radius:1.25,boundary:'clamp'},ctx),stats:gpuImageStats()};
}}));
export const replaced=defineMediaStage(()=>({async renderAt(ctx,inputs:{image:ProfessionalSurface;mask:ProfessionalSurface}){
 return {surface:await replaceMatte(inputs.image,inputs.mask,{},ctx),stats:gpuImageStats()};
}}));
export const finalOffset=defineMediaStage(()=>({async renderAt(ctx,inputs:{image:ProfessionalSurface}){
 return {surface:await offsetRGB(inputs.image,{offset:[.5,-.125,-.5]},ctx),stats:gpuImageStats()};
}}));
export default <Composition width={160} height={90} fps={12} durationInFrames={3} background="#000000"><Stage id="source" factory={source} outputs={{surface:'surface'}}/><Stage id="shifted" factory={shifted} inputs={{image:ref('source')}} outputs={{surface:'surface',stats:'json'}}/><Stage id="mask" factory={mask} outputs={{surface:'surface',stats:'json'}}/><Stage id="matte" factory={replaced} inputs={{image:ref('shifted'),mask:ref('mask')}} outputs={{surface:'surface',stats:'json'}}/><Stage id="image" factory={finalOffset} inputs={{image:ref('matte')}} outputs={{surface:'surface',stats:'json'}}/><Layer source={ref('source')} scale={.5} y={22.5}/><Layer source={ref('image')} scale={.5} x={80} y={22.5}/></Composition>;
