import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {defineMediaStage,surfaceFromPixels,linear709} from '@frameweave/engine/native';
import {replaceMatte,applyMatte,feather,gpuImageStats} from 'test.gpu-images';
import type {ProfessionalSurface} from '@frameweave/engine';
export const source=defineMediaStage(init=>({renderAt(){
 const p=new Float32Array(init.width*init.height*4);for(let y=0;y<init.height;y++)for(let x=0;x<init.width;x++)p.set([4+.01*x,1.25+.002*y,-.1-.001*x,x<80?.25:0],(y*init.width+x)*4);
 return {surface:surfaceFromPixels(init.width,init.height,p,{format:'rgba32float',color:linear709,alpha:'straight'})};
}}));
export const mask=defineMediaStage(init=>({async renderAt(ctx){
 const p=new Float32Array(init.width*init.height*4),cx=init.width*(.3+.2*ctx.progress);for(let y=0;y<init.height;y++)for(let x=0;x<init.width;x++)p.set([3,-2,.1,(x-cx)**2+(y-init.height*.5)**2<22**2?.65:0],(y*init.width+x)*4);
 const raw=surfaceFromPixels(init.width,init.height,p,{format:'rgba32float',color:linear709,alpha:'straight'});return {surface:await feather(raw,{radius:1.25,boundary:'clamp'},ctx),stats:gpuImageStats()};
}}));
export const multiplied=defineMediaStage(()=>({async renderAt(ctx,inputs:{image:ProfessionalSurface;mask:ProfessionalSurface}){
 return {surface:await applyMatte(inputs.image,inputs.mask,{alpha:'premultiplied'},ctx),stats:gpuImageStats()};
}}));
export const straight=defineMediaStage(()=>({async renderAt(ctx,inputs:{image:ProfessionalSurface;mask:ProfessionalSurface}){
 return {surface:await replaceMatte(inputs.image,inputs.mask,{alpha:'straight'},ctx),stats:gpuImageStats()};
}}));
export const replaced=defineMediaStage(()=>({async renderAt(ctx,inputs:{image:ProfessionalSurface;mask:ProfessionalSurface}){
 return {surface:await replaceMatte(inputs.image,inputs.mask,{},ctx),stats:gpuImageStats()};
}}));
export default <Composition width={160} height={90} fps={12} durationInFrames={3} background="#000000"><Stage id="source" factory={source} outputs={{surface:'surface'}}/><Stage id="mask" factory={mask} outputs={{surface:'surface',stats:'json'}}/><Stage id="old" factory={multiplied} inputs={{image:ref('source'),mask:ref('mask')}} outputs={{surface:'surface',stats:'json'}}/><Stage id="straight" factory={straight} inputs={{image:ref('source'),mask:ref('mask')}} outputs={{surface:'surface',stats:'json'}}/><Stage id="image" factory={replaced} inputs={{image:ref('straight'),mask:ref('mask')}} outputs={{surface:'surface',stats:'json'}}/><Layer source={ref('old')} scale={.5} y={22.5}/><Layer source={ref('image')} scale={.5} x={80} y={22.5}/></Composition>;
