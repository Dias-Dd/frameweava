import {defineNativeStage} from '../../native-gpu/authoring.ts';
import {publish} from '../composite/stage.ts';
import {createImageTools,compose,exposure,offsetRGB,floatImageResource} from './index.ts';
import {cases,width,height} from './neural-cases.ts';
// Existing Stage integration: no imageStage dependency, new owner or renderer.
export const neuralNumeric=defineNativeStage(async init=>{
 const tools=createImageTools(init),f32=floatImageResource('photo',{width,height}),f16=floatImageResource('photo',{width,height,format:'rgba16float'});
 await tools.prepareSources([f32,f16,...cases.flatMap(c=>[...(c.effect.sources??[]),...(c.direct.sources??[])])]);
 await tools.prepareAssets(cases.flatMap(c=>[...(c.effect.assets??[]),...(c.direct.assets??[])]));
 return {async renderAt(context){const c=cases[context.frame%100];if(!c)throw Error('Unknown neural case');const source=context.frame>=100?f16:f32;
  const image=await tools.apply(source,compose(exposure(1),offsetRGB({offset:[-.1,-.1,-.1]})),{context});
  const actual=await tools.apply(image,c.effect,{context});await publish(init.gpu,'actual',actual);
  const direct=await tools.apply(image,c.direct,{context});await publish(init.gpu,'direct',direct);return direct;
 },async dispose(){await tools.dispose();await tools.dispose();}};
});
