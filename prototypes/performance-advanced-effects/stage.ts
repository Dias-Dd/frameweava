import {defineMediaStage,createGpuEffectChain} from '../../src/web/api.ts';
import type {ProfessionalSurface} from '../../src/media/surface.ts';
import {recipe,names} from './recipe.ts';
export default defineMediaStage<Record<string,never>,Record<string,never>,{surface:ProfessionalSurface;metrics:any}>(async init=>{
 const chain=await createGpuEffectChain({width:init.width,height:init.height,effects:[],backend:'webgpu',profiling:false,maxPixels:16777216});
 try{
  const gpu=await chain.createPixelScope({maxBufferBytes:1024**3,maxPendingPasses:128});
  return {async renderAt(ctx){
   const start=performance.now(),out=await recipe(gpu,ctx,init.width,init.height),recorded=performance.now();
   try{
    await gpu.complete();const complete=performance.now();
    const surface=await gpu.readback(out.image),read=performance.now();
    return {surface,metrics:{names,recordMs:recorded-start,computeAndValidationMs:complete-start,
     finalReadbackMs:read-complete,scope:gpu.stats(),core:chain.stats(),timings:gpu.timings()}};
   }finally{await out.release();}
  },dispose:()=>chain.dispose()};
 }catch(e){await chain.dispose();throw e;}
});
