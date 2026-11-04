import {defineMediaStage,linear709,type ProfessionalSurface} from '@frameweave/engine/native';
import {createNoiseTextureRenderer} from 'spatial-effects';
export default defineMediaStage<Record<string,never>,{format?:'rgba16float'|'rgba32float';release?:boolean},{surface:ProfessionalSurface;metrics:Record<string,any>}>(init=>{
  const owner=createNoiseTextureRenderer({width:init.width,height:init.height,workingColor:linear709});let last:ProfessionalSurface|undefined;
  return {async renderAt(ctx,_inputs,props){
    if(props.release){await owner.dispose();return {surface:last!,metrics:{release:true,...owner.stats()}};}
    last=await owner.render({dimensions:3,noise:{seed:init.seed,algorithm:'openSimplex2',frequency:.018,fractal:{kind:'fbm',octaves:4},warp:{kind:'openSimplex2Reduced',frequency:.009,amplitude:22,mode:'progressive',octaves:3}},
      origin:[-120,-40,12],motion:[12,0,22],stepX:[1,0,0],stepY:[0,1,0],base:[.025,.06,.12],ink:[-.15,.8,2.8],gain:1.4,bias:.12,alpha:.7},ctx,props.format??'rgba32float');
    return {surface:last,metrics:{frame:ctx.frame,pixels:init.width*init.height,gpuRequired:true,cpuPixelFallback:false,...owner.stats()}};
  },dispose:()=>owner.dispose()};
});
