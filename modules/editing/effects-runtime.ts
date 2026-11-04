import {createNativeRecipeProcessor} from '../native-effects/images.ts';
import {createProfessionalFilters} from '../gpu-image-effects/resident/filters.ts';
import {createPaFilters} from '../native-effects/pa/filters.ts';
import {publishImage} from '../spatial-creation/composition-core.ts';
import type {NativeStageInit} from '../native-gpu/authoring.ts';
import type {GpuPixelImage} from '../gpu-effects/pixel-types.ts';
import type {FrameContext} from '../../src/core/types.ts';
import type {EditFilters,EditImageEffect} from './effects.ts';
/** Reuse the existing recipe's scratch ownership; one owned GPU publication at chain end. */
export function createEditEffectProcessor(init:NativeStageInit){
 const processor=createNativeRecipeProcessor<EditFilters>(init,(gpu,c,track,signal)=>({...createProfessionalFilters(gpu,c,track,signal),...createPaFilters(gpu,c,track,signal)}));
 return {async apply(input:GpuPixelImage,calls:readonly EditImageEffect[],context:FrameContext,signal?:AbortSignal){
  const retained=await processor.processImage(input,async(image,fx)=>{let current=image;for(const call of calls){
   const pa=call.name==='blur'||call.name==='glow',defaults=call.name==='blur'?{radius:2}:call.name==='glow'?{radius:6,intensity:.5,threshold:1}:{};
   const method=fx[call.name] as (image:GpuPixelImage,options:Record<string,unknown>)=>Promise<GpuPixelImage>;
   current=await method(current,{...defaults,...call.options,format:'rgba32float',...pa?{alpha:'premultiplied'}:{},signal});
  }return current;},{context,signal});
  // Recipe outputs are retained by the existing processor; callers receive a distinct owned image.
  return publishImage(init,retained,'rgba32float',signal);
 },stats:()=>processor.stats(),dispose:()=>processor.dispose()};
}
