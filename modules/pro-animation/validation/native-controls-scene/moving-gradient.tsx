/** @jsxImportSource @frameweave/engine */
import {Composition,Stage,Layer,ref,linear709,keyframes} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {createNativeTransitions} from '../../src/native-transitions/index.ts';
import {sourceKernel,atlasKernel,transparentKernel} from '../native-transition-scene/fixture.ts';
// Left: current-time gradient. Right: actual gradient/completion shutter samples.
export const moving=defineNativeStage(async init=>{
 const g=init.gpu,fx=createNativeTransitions(init),source=await g.compile(sourceKernel),stamp=await g.compile(atlasKernel),blank=await g.compile(transparentKernel);
 const mask=await g.compile({abiVersion:1,id:'example/moving-gradient',version:'1.0.0',inputCount:0,parameterWords:1,code:'fn pixel(p:vec2u)->vec4f{let uv=(vec2f(p)+.5)/vec2f(outputSize());let v=clamp(uv.x+.22*sin(paramF32(0u)*50.26548246+uv.y*8.),0.,1.);return vec4f(v,v,v,1.);}'});
 const progress=keyframes([{frame:0,value:0},{frame:23,value:1}]);
 return {async renderAt(context){
  const output={width:160,height:180,format:'rgba32float' as const,alpha:'premultiplied' as const,color:linear709};
  const a=await g.run(source,[],{parameters:Uint32Array.of(0,0),output}),b=await g.run(source,[],{parameters:Uint32Array.of(1,0),output});
  const gradientAt=(c:typeof context)=>g.run(mask,[],{parameters:Float32Array.of(c.time),output:{...output,alpha:'opaque'}}),current=await gradientAt(context);
  const left=await fx.imageWipe(a,b,current,{progress,softness:.015},context),right=await fx.imageWipe(a,b,current,{progress,softness:.015,autoSoftness:true,temporalSamples:16,gradientAt},context);
  let image=await g.run(blank,[],{output:{...output,width:320}});for(const [x,tile]of [[0,left],[160,right]] as const){const next=await g.run(stamp,[image,tile],{parameters:Uint32Array.of(x,0)});await g.release(image);image=next;await g.release(tile);}
  await g.release(a);await g.release(b);await g.release(current);return image;
 }};
});
export default <Composition width={320} height={180} fps={24} durationInFrames={24} background="transparent"><Stage id="moving" factory={moving}/><Layer source={ref('moving')}/></Composition>;
