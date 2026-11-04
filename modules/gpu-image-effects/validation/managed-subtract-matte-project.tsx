import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {defineMediaStage,surfaceFromPixels,linear709} from '@frameweave/engine/native';
import {subtractMatte,feather,fill,gpuImageStats} from 'test.gpu-images';
import type {ProfessionalSurface} from '@frameweave/engine';
export const first=defineMediaStage(init=>({async renderAt(ctx){
 const p=new Float32Array(init.width*init.height*4);for(let y=0;y<init.height;y++)for(let x=0;x<init.width;x++)p[(y*init.width+x)*4+3]=(x-80)**2+(y-45)**2<28**2?.8:0;
 const raw=surfaceFromPixels(init.width,init.height,p,{format:'rgba32float',color:linear709,alpha:'premultiplied'});return {surface:await feather(raw,{radius:1.25,boundary:'clamp'},ctx),stats:gpuImageStats()};
}}));
export const second=defineMediaStage(init=>({async renderAt(ctx){
 const p=new Float32Array(init.width*init.height*4),cx=80+16*ctx.progress;for(let y=0;y<init.height;y++)for(let x=0;x<init.width;x++)p[(y*init.width+x)*4+3]=(x-cx)**2+(y-45)**2<22**2?1:0;
 const raw=surfaceFromPixels(init.width,init.height,p,{format:'rgba32float',color:linear709,alpha:'premultiplied'});return {surface:await feather(raw,{radius:1.25,boundary:'clamp'},ctx),stats:gpuImageStats()};
}}));
export const painted=defineMediaStage(()=>({async renderAt(ctx,inputs:{mask:ProfessionalSurface}){
 return {surface:await fill(inputs.mask,{color:[4,.7,-.1]},ctx),stats:gpuImageStats()};
}}));
export const difference=defineMediaStage(()=>({async renderAt(ctx,inputs:{first:ProfessionalSurface;second:ProfessionalSurface}){
 return {surface:await subtractMatte(inputs.first,inputs.second,{},ctx),stats:gpuImageStats()};
}}));
export default <Composition width={160} height={90} fps={12} durationInFrames={3} background="#000000"><Stage id="first" factory={first} outputs={{surface:'surface',stats:'json'}}/><Stage id="second" factory={second} outputs={{surface:'surface',stats:'json'}}/><Stage id="original" factory={painted} inputs={{mask:ref('first')}} outputs={{surface:'surface',stats:'json'}}/><Stage id="difference" factory={difference} inputs={{first:ref('first'),second:ref('second')}} outputs={{surface:'surface',stats:'json'}}/><Stage id="image" factory={painted} inputs={{mask:ref('difference')}} outputs={{surface:'surface',stats:'json'}}/><Layer source={ref('original')} scale={.5} y={22.5}/><Layer source={ref('image')} scale={.5} x={80} y={22.5}/></Composition>;
