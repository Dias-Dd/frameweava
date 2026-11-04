import {Composition,CompositeStage,Stage,Layer,ref,stageInput,linear709} from '@frameweave/engine';
import {defineNativeStage,defineCompositeStage,type GpuPixelImage,type NativeStageCalls} from '@frameweave/engine/native';

export const source=defineNativeStage(async({gpu,width,height})=>{
 const kernel=await gpu.compile({abiVersion:1,id:'so2/source',version:'1.0.0',inputCount:0,parameterWords:1,code:'fn pixel(p:vec2u)->vec4f{return vec4f(2.+paramF32(0u),-.5,4.,.5);}'});
 return {renderAt(c){return gpu.run(kernel,[],{parameters:new Uint32Array(Float32Array.of(c.frame/4).buffer),output:{width,height,format:'rgba32float',alpha:'premultiplied',color:linear709}});}};
});

export const step=defineNativeStage(async({gpu})=>{
 const kernel=await gpu.compile({abiVersion:1,id:'so2/step',version:'1.0.0',inputCount:1,parameterWords:0,code:'fn pixel(p:vec2u)->vec4f{return read0(vec2i(p))+vec4f(.25,0.,0.,0.);}'});
 return {async renderAt(c,inputs:{surface:GpuPixelImage;score:number}){
  return {surface:await gpu.run(kernel,[inputs.surface],{output:{...inputs.surface.info,format:'rgba32float'}}),score:inputs.score+1};
 }};
});

/** An ordinary reusable async function; the caller supplies its active scope. */
export async function enhance(stages:NativeStageCalls,media:GpuPixelImage,target=5){
 let image=media,score=0;
 while(score<target){
  const result=await stages.run<{surface:GpuPixelImage;score:number}>('stepGroup',{inputs:{surface:image,score}});
  image=result.outputs.surface;score=result.outputs.score;
 }
 return {surface:image,score};
}
export const iterate=defineCompositeStage(({stages})=>({
 async renderAt(_context,inputs:{surface:GpuPixelImage}){
  return enhance(stages,inputs.surface);
 }
}));

export const finish=defineNativeStage(({gpu})=>({
 async renderAt(_context,inputs:{surface:GpuPixelImage;score:number}){
  if(inputs.score!==5)throw new Error('SO-2 convergence result was not passed through the outer DAG');
  const result=await gpu.convertColor(inputs.surface,{version:1,color:linear709,format:'rgba16float'});
  const snapshot=await gpu.cloneBuffer(await gpu.imageToBuffer!(result,{version:1}));
  await gpu.publishBuffer('pixels',snapshot,{version:1});
  return result;
 }
}));

export default <Composition width={32} height={16} fps={24} durationInFrames={4} background="transparent">
 <Stage id="source" factory={source}/>
 <CompositeStage id="group" inputs={{surface:ref('source')}} inputTypes={{surface:'surface'}} outputs={{surface:'surface',score:'number'}} publish={{surface:ref('loop'),score:ref('loop','score')}}>
  <CompositeStage id="loop" mode="explicit" factory={iterate} inputs={{surface:stageInput('surface')}} inputTypes={{surface:'surface'}} outputs={{surface:'surface',score:'number'}}>
   <CompositeStage id="stepGroup" inputTypes={{surface:'surface',score:'number'}} outputs={{surface:'surface',score:'number'}} publish={{surface:ref('step'),score:ref('step','score')}}>
    <Stage id="step" factory={step} inputs={{surface:stageInput('surface'),score:stageInput('score')}} inputTypes={{surface:'surface',score:'number'}} outputs={{surface:'surface',score:'number'}}/>
   </CompositeStage>
  </CompositeStage>
 </CompositeStage>
 <Stage id="finish" factory={finish} inputs={{surface:ref('group'),score:ref('group','score')}} inputTypes={{surface:'surface',score:'number'}}/>
 <Layer source={ref('finish')}/>
</Composition>;
