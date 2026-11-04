import {Composition,Stage,Layer,ref,linear709} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {processImage,imageStats,processRaster,rasterStats} from 'native-image-effects';

export const background=defineNativeStage(async init=>{
 const kernel=await init.gpu.compile({abiVersion:1,id:'example/native-image-source',version:'1.0.0',inputCount:0,parameterWords:1,
  code:'fn pixel(p:vec2u)->vec4f{let u=f32(p.x)/f32(outputSize().x);let v=f32(p.y)/f32(outputSize().y);return vec4f(1.5+u,-.25+v,.4+paramF32(0u),1.);}'});
 return {async renderAt(context){
  const image=await init.gpu.run(kernel,[],{parameters:Float32Array.of(context.frame/1000),output:{width:init.width,height:init.height,format:'rgba32float',alpha:'opaque',color:linear709}});
  return processImage(image,async (input,fx)=>{
   const mixed=await fx.channelMix(input,{matrix:[[1,.01,0],[0,1,0],[0,0,1]]});
   const graded=await fx.colorBalance(mixed,{highlights:[.02,0,-.01]});
   return fx.filmGrain(graded,{amount:.002,seed:37,animated:true});
  },{context});
 }};
});
// Both factories share the same managed imports; each receives its own binding
// instance and borrowed scope. No GPU image handle crosses through JavaScript JSON.
export const finishing=defineNativeStage(init=>({async renderAt(context,inputs){
 const output=await processRaster(inputs.image,async(input,fx)=>fx.glow(await fx.exposure(input,{stops:0}),{radius:2,threshold:1,intensity:.1}),{context});
 if(imageStats().completion!=='recorded-only'||rasterStats().completion!=='recorded-only')throw Error('Unexpected completion contract');
 return output;
}}));

export default <Composition width={960} height={540} fps={24} durationInFrames={240} background="transparent">
 <Stage id="source" factory={background}/>
 <Stage id="finish" factory={finishing} inputs={{image:ref('source')}} inputTypes={{image:'surface'}}/>
 <Layer source={ref('finish')}/>
</Composition>;
