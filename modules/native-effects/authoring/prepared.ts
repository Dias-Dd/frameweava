import type {NativeStageInit} from '../../native-gpu/authoring.ts';
import type {ImageAsset,ImageEffect,ImageFrame,ImageProcessor} from './types.ts';
import {authoringError,active,withImageAssets} from './runtime.ts';

/** Once-per-Stage async initialization through the existing admitted init.
 * It never acquires a device, permission, model or service on its own. */
export function prepareImageEffects<F>(factory:(init:NativeStageInit)=>ImageProcessor<F>|Promise<ImageProcessor<F>>):ImageAsset<ImageProcessor<F>> {
  if(typeof factory!=='function')authoringError('factory','expected an existing effect initializer');
  return Object.freeze({async prepare(init,options){active(options.signal);const processor=await factory(init);if(!processor||typeof processor.processImage!=='function'||typeof processor.generateImage!=='function'||typeof processor.dispose!=='function'){if(processor&&typeof processor.dispose==='function')await processor.dispose();authoringError('factory.result','expected the existing typed image processor');}try{active(options.signal);}catch(error){await processor.dispose();throw error;}let closing:Promise<void>|undefined;return {value:processor,dispose(){return closing??=processor.dispose();}};}} satisfies ImageAsset<ImageProcessor<F>>);
}
export function withPreparedEffects<F>(asset:ImageAsset<ImageProcessor<F>>,recipe:(image:Parameters<ImageEffect>[0],filters:F,frame:ImageFrame)=>ReturnType<ImageEffect>,name?:string):ImageEffect {
  if(typeof recipe!=='function')authoringError('recipe','expected an ordinary image recipe');
  const operation:ImageEffect=(image,frame)=>frame.process(asset,image,async(source,filters)=>recipe(source,filters,frame));
  if(name!==undefined&&typeof name!=='string')authoringError('name','expected an optional diagnostic name');Object.defineProperty(operation,'name',{value:name??recipe.name??'preparedImageEffect'});
  return withImageAssets(operation,asset);
}
