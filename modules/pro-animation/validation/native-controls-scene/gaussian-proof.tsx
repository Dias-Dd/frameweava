/** @jsxImportSource @frameweave/engine */
import {Composition,Stage,Layer,ref,linear709} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {createNativeTransitions} from '../../src/native-transitions/index.ts';
import {managedGaussian} from './managed-gaussian.ts';
export const precision=defineNativeStage(async init=>{
 const g=init.gpu,fx=createNativeTransitions({...init,blurMask:managedGaussian(g)}),k=await g.compile({abiVersion:1,id:'validation/transition-mean-fixture',version:'1.0.0',inputCount:0,parameterWords:1,code:'fn pixel(p:vec2u)->vec4f{let k=paramU32(0u);if(k==0u){return vec4f(-.125,3.,.25,.5);}if(k==1u){return vec4f(1.25,-.25,2.,.25);}let uv=(vec2f(p)+.5)/vec2f(outputSize());return vec4f(uv.x,uv.y,.5,1.);}'});
 return {async renderAt(){
  const output={width:32,height:20,format:'rgba32float' as const,alpha:'premultiplied' as const,color:linear709},a=await g.run(k,[],{parameters:Uint32Array.of(0),output}),b=await g.run(k,[],{parameters:Uint32Array.of(1),output}),m=await g.run(k,[],{parameters:Uint32Array.of(2),output:{...output,width:4,height:3}});
  const result=await fx.warpTransition(a,b,m,{progress:.371,reactor:'contrast',smoothness:1});await g.release(a);await g.release(b);await g.release(m);
  const values=await g.imageToBuffer!(result,{version:1});await g.publishBuffer('reference',values,{version:1});await g.releaseBuffer(values);return result;
 }};
});
export default <Composition width={32} height={20} fps={24} durationInFrames={4} background="transparent"><Stage id="precision" factory={precision}/><Layer source={ref('precision')}/></Composition>;
