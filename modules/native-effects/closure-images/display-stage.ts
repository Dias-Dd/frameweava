import {defineNativeStage} from '../../native-gpu/authoring.ts';
import {linear709} from '../../../src/media/surface.ts';
import {createNativeClosureEffects} from '../closure-filters/index.ts';
import raw from '../closure-filters/fixtures/processors.json';
import delivery from './display-profile.json';
import type {OcioDefinition} from '../closure-filters/types.ts';
const processor=(raw as OcioDefinition[])[1],deliveryProcessor=delivery.processor as OcioDefinition;
const source={abiVersion:1 as const,id:'fixture/ocio-terminal-source',version:'1.0.0',inputCount:0,parameterWords:1,code:'fn pixel(p:vec2u)->vec4f{let uv=(vec2f(p)+.5)/vec2f(outputSize());let c=vec3f(uv.x*4.-.2,.1+uv.y*.5,1.3-uv.x+paramF32(0u)*.2);let a=select(.5,1.,p.y>outputSize().y/2u);return vec4f(c*a,a);}'};
/** The ordinary scene image is only the Native scheduling/presentation output.
 * Explicit Node terminal consumers select the named DISPLAY DATA lease. It is
 * never secretly relabelled as the normal Layer's scene-linear image. */
export const ocioDisplayStage=defineNativeStage(async init=>{const g=init.gpu,effects=await createNativeClosureEffects(init,{ocioProcessors:[processor,deliveryProcessor]});return {async renderAt(context,_inputs,props){const image=await g.run(await g.compile(source),[],{parameters:Float32Array.of(context.progress),output:{width:init.width,height:init.height,format:'rgba32float',color:linear709,alpha:'premultiplied'}});if(props.reference===true){const sourceData=await g.imageToBuffer!(image,{version:1});try{await g.publishBuffer('source',sourceData,{version:1});}finally{await g.releaseBuffer(sourceData);}}return effects.processImage(image,async(i,f)=>{const display=await f.ocioDisplayTransform(i,props.delivery===true?deliveryProcessor:processor);await g.publishBuffer('display',display.buffer,{version:1});return i;},{context});},async dispose(){await effects.dispose();await effects.dispose();}};});
