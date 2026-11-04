import {Composition,Stage,Layer,ref,keyframes} from '@frameweave/engine';
import {defineMediaStage,surfaceFromPixels,linear709} from '@frameweave/engine/native';
import {fill,crossfade,over,offsetRGB,gpuImageStats} from 'test.gpu-images';
import type {ProfessionalSurface} from '@frameweave/engine';
const mix=keyframes([{frame:0,value:0},{frame:2,value:1}]);
export const first=defineMediaStage(init=>({async renderAt(ctx){
 const p=new Float32Array(init.width*init.height*4);for(let y=0;y<init.height;y++)for(let x=0;x<init.width;x++)p[(y*init.width+x)*4+3]=(x-64)**2+(y-45)**2<24**2?.5:0;
 const mask=surfaceFromPixels(init.width,init.height,p,{format:'rgba32float',color:linear709,alpha:'premultiplied'});return {surface:await fill(mask,{color:[6,.7,-.1]},ctx),stats:gpuImageStats()};
}}));
export const second=defineMediaStage(init=>({async renderAt(ctx){
 const p=new Float32Array(init.width*init.height*4);for(let y=0;y<init.height;y++)for(let x=0;x<init.width;x++)p[(y*init.width+x)*4+3]=(x-96)**2+(y-45)**2<24**2?.25:0;
 const mask=surfaceFromPixels(init.width,init.height,p,{format:'rgba32float',color:linear709,alpha:'premultiplied'});return {surface:await fill(mask,{color:[-.1,.5,8]},ctx),stats:gpuImageStats()};
}}));
export const faded=defineMediaStage(()=>({async renderAt(ctx,inputs:{first:ProfessionalSurface;second:ProfessionalSurface}){
 return {surface:await crossfade(inputs.first,inputs.second,{mix},ctx),stats:gpuImageStats()};
}}));
export const covered=defineMediaStage(()=>({async renderAt(ctx,inputs:{first:ProfessionalSurface;second:ProfessionalSurface}){
 return {surface:await over(inputs.second,inputs.first,{opacity:mix},ctx),stats:gpuImageStats()};
}}));
export const graded=defineMediaStage(()=>({async renderAt(ctx,inputs:{image:ProfessionalSurface}){
 return {surface:await offsetRGB(inputs.image,{offset:[-.125,.0625,-.25]},ctx),stats:gpuImageStats()};
}}));
export default <Composition width={160} height={90} fps={12} durationInFrames={3} background="#000000"><Stage id="first" factory={first} outputs={{surface:'surface',stats:'json'}}/><Stage id="second" factory={second} outputs={{surface:'surface',stats:'json'}}/><Stage id="faded" factory={faded} inputs={{first:ref('first'),second:ref('second')}} outputs={{surface:'surface',stats:'json'}}/><Stage id="covered" factory={covered} inputs={{first:ref('first'),second:ref('second')}} outputs={{surface:'surface',stats:'json'}}/><Stage id="image" factory={graded} inputs={{image:ref('faded')}} outputs={{surface:'surface',stats:'json'}}/><Layer source={ref('covered')} scale={.5} y={22.5}/><Layer source={ref('image')} scale={.5} x={80} y={22.5}/></Composition>;
