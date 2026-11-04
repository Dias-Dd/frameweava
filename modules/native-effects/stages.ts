import {defineNativeStage} from '../native-gpu/authoring.ts';
import type {GpuPixelImage} from '../gpu-effects/pixel-types.ts';
import {createNativeImageEffects} from './images.ts';
import {createGeometrySeed,geometrySource,applyEffect} from './workload.ts';
interface Props {format?:'rgba16float'|'rgba32float';partial?:boolean;single?:boolean;geometryOnly?:boolean;index?:number}
/** One Stage/lease, one shared scope, all twenty real calls and typed geometry. */
export const combined=defineNativeStage<Record<string,never>,Props>(async init=>{
 const seed=await createGeometrySeed(init.gpu),effects=createNativeImageEffects(init);
 return {async renderAt(context,_inputs,props){const source=await geometrySource(init.gpu,seed,context,init.width,init.height,props.format??'rgba32float',props.partial,props.geometryOnly);if(props.geometryOnly)return source;
  return effects.processImage(source,async(i,fx)=>{if(props.single)return applyEffect(context.frame%20,i,source,fx,context);for(let n=0;n<20;n++)i=await applyEffect(n,i,source,fx,context);return i;},{context});
 },dispose:effects.dispose};
});
export const sourceOnly=defineNativeStage<Record<string,never>,Props>(async init=>{const seed=await createGeometrySeed(init.gpu);return {renderAt:(context,_inputs,props)=>geometrySource(init.gpu,seed,context,init.width,init.height,props.format??'rgba32float',props.partial,props.geometryOnly)};});
/** Matched baseline: same original algorithms/quality and native owner, but one
 * existing Stage RPC/lease per effect. This is NOT a Web-vs-native speed claim. */
export const oneEffect=defineNativeStage<{image:GpuPixelImage;original:GpuPixelImage},Props>(init=>{const effects=createNativeImageEffects(init);return {renderAt:(context,inputs,props)=>effects.processImage(inputs.image,(i,fx)=>applyEffect(props.index!,i,inputs.original,fx,context),{context}),dispose:effects.dispose};});
