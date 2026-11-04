import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {defineNativeStage} from '../../native-gpu/authoring.ts';
import {linear709} from '../../../src/media/surface.ts';
import {createServo} from '../index.ts';
export const background=defineNativeStage(async({gpu,width,height})=>{
 const k=await gpu.compile({abiVersion:1,id:'example/servo-hdr-background',version:'1.0.0',inputCount:0,parameterWords:0,code:'fn pixel(p:vec2u)->vec4f{return vec4f(2.,-.25,.5,1.);}'});
 return {renderAt(){return gpu.run(k,[],{output:{width,height,color:linear709,format:'rgba32float',alpha:'opaque'}});}};
});
export const overlay=defineNativeStage(async({gpu,width,height,seed})=>{
 const ui=await createServo(gpu,{profile:'sdr-srgb8',execution:'trusted-local',width,height,input:false,seed,
  html:'<div style="position:absolute;left:0;top:0;width:40%;height:100%;background:rgba(255,255,255,.5)"></div>'});
 return {renderAt(context){return ui.render(undefined,{context});},dispose(){return ui.dispose();}};
});
// Servo generates SDR UI on a separate branch. The professional background
// never crosses its explicit 8-bit boundary and remains HDR/negative in EXR.
export default <Composition width={320} height={180} fps={24} durationInFrames={24} background="transparent"><Stage id="hdr" factory={background}/><Stage id="ui" factory={overlay}/><Layer source={ref('hdr')}/><Layer source={ref('ui')}/></Composition>;
