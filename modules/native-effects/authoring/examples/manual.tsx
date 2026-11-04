import {Composition,Stage,Layer,Resource,ref,linear709} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {createNativeRasterEffects} from '../../raster/filters.ts';
import {createNativeProfessionalEffects} from '../../extended.ts';
import {createNativeGradingEffects} from '../../grading/index.ts';
import {exposureStops} from './look.ts';
export const manual=defineNativeStage<Record<string,never>,{half?:boolean}>(init=>{
  const raster=createNativeRasterEffects(init),pro=createNativeProfessionalEffects(init),grade=createNativeGradingEffects(init);
  return {async renderAt(context,_inputs,props){
    const source=await init.gpu.importResource({version:1,id:'photo',decode:'surface-v2',output:{width:init.width,height:init.height,format:props.half?'rgba16float':'rgba32float',alpha:'premultiplied',color:linear709}}),o={context};
    let image=await raster.processImage(source,(i,f)=>f.exposure(i,{stops:exposureStops}),o);
    image=await grade.processImage(image,(i,f)=>f.whiteBalance(i),o);
    image=await pro.processImage(image,(i,f)=>f.colorBalance(i,{highlights:[.02,0,-.01]}),o);
    image=await raster.processImage(image,(i,f)=>f.glow(i,{radius:3,threshold:1,intensity:.15,boundary:'clamp'}),o);
    image=await pro.processImage(image,(i,f)=>f.vignette(i,{amount:.15}),o);
    return pro.processImage(image,(i,f)=>f.filmGrain(i,{amount:.002,seed:37,animated:true}),o);
  },async dispose(){await Promise.all([raster.dispose(),pro.dispose(),grade.dispose()]);}};
});
export default <Composition width={160} height={90} fps={24} durationInFrames={12} background="transparent"><Resource id="photo" src="./assets/input.surface.json" kind="file"/><Stage id="finish" factory={manual}/><Layer source={ref('finish')}/></Composition>;
