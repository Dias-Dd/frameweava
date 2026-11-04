import {Composition,Stage,Layer,ref,keyframes} from '@frameweave/engine';
import {defineMediaStage,surfaceFromPixels,linear709} from '@frameweave/engine/native';
import {tile,reframe,exposure,gpuImageStats} from 'test.gpu-images';
import type {ProfessionalSurface} from '@frameweave/engine';
export const texture=defineMediaStage(init=>({renderAt(){
 const p=new Float32Array(init.width*init.height*4);
 for(let y=0;y<init.height;y++)for(let x=0;x<init.width;x++){const i=(y*init.width+x)*4,top=y<4,left=x<8,rgb=top?(left?[4,3,-.25]:[.1,4,.4]):left?[4,.2,2]:[.2,.3,4],a=top?(left?1:.75):left?.5:0;p.set([rgb[0]*a,rgb[1]*a,rgb[2]*a,a],i);}
 return {surface:surfaceFromPixels(init.width,init.height,p,{format:'rgba32float',color:linear709,alpha:'premultiplied'})};
}}));
export const pattern=defineMediaStage(()=>({async renderAt(ctx,inputs:{texture:ProfessionalSurface}){
 const repeated=await tile(inputs.texture,{mode:'mirror',offset:[keyframes([{frame:0,value:0},{frame:2,value:4}]),keyframes([{frame:0,value:0},{frame:2,value:-2}])]},ctx);
 return {surface:await reframe(repeated,{flipX:true},ctx),stats:gpuImageStats()};
}}));
export const exposed=defineMediaStage(()=>({async renderAt(ctx,inputs:{pattern:ProfessionalSurface}){
 const surface=await exposure(inputs.pattern,{stops:keyframes([{frame:0,value:-1},{frame:2,value:1}])},ctx);
 return {surface,stats:gpuImageStats()};
}}));
export default <Composition width={160} height={90} fps={12} durationInFrames={3} background="#000000"><Stage id="texture" factory={texture} width={16} height={8} outputs={{surface:'surface'}}/><Stage id="pattern" factory={pattern} inputs={{texture:ref('texture')}} outputs={{surface:'surface',stats:'json'}}/><Stage id="image" factory={exposed} inputs={{pattern:ref('pattern')}} outputs={{surface:'surface',stats:'json'}}/><Layer source={ref('image')}/></Composition>;
