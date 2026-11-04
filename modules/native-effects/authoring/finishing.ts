import {createNativeFinishingEffects} from '../finishing/index.ts';
import type {ScribbleMask,ScribbleOptions,StereoOptions} from '../finishing/types.ts';
import {createNativeClosureImageEffects} from '../closure-images/index.ts';
import type {PathOptions,Stroke} from '../closure-images/types.ts';
import type {PathData} from '../../graphics-contracts/types.ts';
import type {ImageEffect,ImageInput} from './types.ts';import {withImageSources} from './runtime.ts';
/** The current image is the left eye; right is an explicit same-frame source. */
export function stereo(right:ImageInput,options:StereoOptions={}):ImageEffect {const effect:ImageEffect=async(image,frame)=>{const r=await frame.input(right);return frame.process(createNativeFinishingEffects,image,(left,f)=>f.stereo(left,r,options));};Object.defineProperty(effect,'name',{value:'stereo'});return withImageSources(effect,right);}
export function scribble(masks:readonly ScribbleMask[],options:ScribbleOptions={}):ImageEffect {const effect:ImageEffect=(image,frame)=>frame.process(createNativeFinishingEffects,image,(source,f)=>f.scribble(source,masks,options));Object.defineProperty(effect,'name',{value:'scribble'});return effect;}
export function pathMatte(path:PathData,options:PathOptions={}):ImageEffect {const effect:ImageEffect=(image,frame)=>frame.process(createNativeClosureImageEffects,image,(source,f)=>f.pathMatte(source,path,options));Object.defineProperty(effect,'name',{value:'pathMatte'});return effect;}
export function pathStroke(path:PathData,options:Stroke={}):ImageEffect {const effect:ImageEffect=(image,frame)=>frame.process(createNativeClosureImageEffects,image,(source,f)=>f.pathStroke(source,path,options));Object.defineProperty(effect,'name',{value:'pathStroke'});return effect;}
