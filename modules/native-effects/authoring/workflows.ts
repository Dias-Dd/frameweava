import {createNativeProKeyEffects} from '../keying-pro/index.ts';
import type {Advanced,Walker,RotoStroke,Hair} from '../keying-pro/types.ts';
import {createNativePsfRestorationEffects} from '../psf-restoration/index.ts';
import type {PsfGridV1,ConvolveOptions,RestoreOptions} from '../psf-restoration/types.ts';
import type {ImageEffect,ImageInput} from './types.ts';
import {authoringError,withImageSources} from './runtime.ts';

/** Inside/outside/background use the same declarative image inputs as over().
 * All remaining controls have the original professional keyer's exact types. */
export interface KeyAdvancedOptions extends Omit<Advanced,'inside'|'outside'|'background'> {
  inside?:ImageInput;outside?:ImageInput;background?:ImageInput;
}
export function keyAdvanced(options:KeyAdvancedOptions={}):ImageEffect {
  if(!options||typeof options!=='object'||Array.isArray(options))authoringError('keyAdvanced.options','expected professional key options');
  const {inside,outside,background,...controls}=options;
  const operation:ImageEffect=async(image,frame)=>{
    const resolved:Advanced={...controls};
    if(inside!==undefined)resolved.inside=await frame.input(inside);
    if(outside!==undefined)resolved.outside=await frame.input(outside);
    if(background!==undefined)resolved.background=await frame.input(background);
    return frame.process(createNativeProKeyEffects,image,(source,f)=>f.keyAdvanced(source,resolved));
  };
  Object.defineProperty(operation,'name',{value:'keyAdvanced'});
  return withImageSources(operation,...[inside,outside,background].filter((v):v is ImageInput=>v!==undefined));
}
export function hairMatte(foreground:ImageInput,background:ImageInput,options:Hair={}):ImageEffect {
  const operation:ImageEffect=async(image,frame)=>{const fg=await frame.input(foreground),bg=await frame.input(background);return frame.process(createNativeProKeyEffects,image,(source,f)=>f.hairMatte(source,fg,bg,options));};
  Object.defineProperty(operation,'name',{value:'hairMatte'});return withImageSources(operation,foreground,background);
}
/** Stroke points/radius are physical image pixels; labels are explicit.
 * Trimap and solver diagnostics remain in one original recipe and are released
 * by its existing owner. This is deterministic stroked matting, not neural roto. */
export function rotoMatte(strokes:readonly RotoStroke[],options:Walker={}):ImageEffect {
  const operation:ImageEffect=(image,frame)=>frame.process(createNativeProKeyEffects,image,async(source,f)=>{
    const trimap=await f.strokeTrimap(source,strokes,{format:options.format,signal:options.signal});
    return (await f.randomWalkerMatte(source,trimap,options)).image;
  });Object.defineProperty(operation,'name',{value:'rotoMatte'});return operation;
}
/** Explicit versioned calibration JSON. GPU weights never escape the recipe.
 * No guessed kernel, hidden profile conversion or source readback is required. */
export function convolveSpatialPsf(grid:PsfGridV1,options:ConvolveOptions={}):ImageEffect {
  const operation:ImageEffect=(image,frame)=>frame.process(createNativePsfRestorationEffects,image,async(source,f)=>f.convolveSpatialPsf(source,await f.prepareSpatialPsf(source,grid),options));
  Object.defineProperty(operation,'name',{value:'convolveSpatialPsf'});return operation;
}
export function spatialDeblur(grid:PsfGridV1,options:RestoreOptions={}):ImageEffect {
  const operation:ImageEffect=(image,frame)=>frame.process(createNativePsfRestorationEffects,image,async(source,f)=>(await f.spatialDeblur(source,await f.prepareSpatialPsf(source,grid),options)).image);
  Object.defineProperty(operation,'name',{value:'spatialDeblur'});return operation;
}
