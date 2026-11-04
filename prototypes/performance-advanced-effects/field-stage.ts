import {defineMediaStage,createGpuEffectChain,withGpuResources} from '../../src/web/api.ts';
import {cellularVolume,vortexField,advectField,renderVolume} from '../../modules/spatial-compute/index.ts';
import type {GpuDataBuffer} from '../../modules/gpu-effects/compute-types.ts';
import type {ProfessionalSurface} from '../../src/media/surface.ts';
export default defineMediaStage<Record<string,never>,Record<string,never>,{surface:ProfessionalSurface;metrics:any}>(async init=>{
 const chain=await createGpuEffectChain({width:init.width,height:init.height,effects:[],backend:'webgpu',profiling:false,maxPixels:16777216});
 try{
  const gpu=await chain.createPixelScope({maxBufferBytes:1024**3,maxPendingPasses:128});
  let cells:GpuDataBuffer|undefined,flow:GpuDataBuffer|undefined;
  return {async renderAt(ctx){
   const start=performance.now();
   cells??=await cellularVolume(gpu,ctx,{dimensions:[32,32,32]});
   flow??=await vortexField(gpu,ctx,{dimensions:[32,32,32],strength:1.5,lift:.1});
   return withGpuResources(gpu,async a=>{
    const density=a.buffer(await advectField(gpu,cells!,flow!,ctx,{dt:ctx.time*.6}));
    const image=a.image(await renderVolume(gpu,density,ctx,{width:init.width,height:init.height,steps:64,color:[.15,.7,3]}));
    const recorded=performance.now();await gpu.complete();const complete=performance.now();
    const surface=await gpu.readback(image),read=performance.now();
    return {surface,metrics:{names:['cellularVolume','vortexField','advectField','renderVolume'],grid:[32,32,32],steps:64,
     recordMs:recorded-start,computeAndValidationMs:complete-start,finalReadbackMs:read-complete,scope:gpu.stats(),core:chain.stats()}};
   });
  },dispose:()=>chain.dispose()};
 }catch(e){await chain.dispose();throw e;}
});
