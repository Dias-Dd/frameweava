import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {defineNativeStage} from '../authoring.ts';
import {linear709} from '../../../src/media/surface.ts';
export const large=defineNativeStage(async init=>{
 const g=init.gpu,k=await g.compile({abiVersion:1,id:'example/dynamic-size/source',version:'1.0.0',inputCount:0,parameterWords:1,code:'fn pixel(p:vec2u)->vec4f{let uv=vec2f(p)/vec2f(outputSize());return vec4f((uv.x*4.-.5+paramF32(0u)*.1)*.75,(uv.y*2.-.25)*.75,2.,.75);}'});
 return {renderAt(c){return g.run(k,[],{parameters:Float32Array.of(c.frame),output:{width:init.width,height:init.height,format:'rgba32float',alpha:'premultiplied',color:linear709}});}};
});
export const proxy=defineNativeStage(async init=>{
 const g=init.gpu,k=await g.compile({abiVersion:1,id:'example/dynamic-size/proxy',version:'1.0.0',inputCount:1,parameterWords:0,code:'fn pixel(p:vec2u)->vec4f{return read0(vec2i((vec2f(p)+.5)/vec2f(outputSize())*vec2f(size0())));}'});
 return {async renderAt(_c,inputs){const out=await g.run(k,[inputs.surface],{output:{width:init.width,height:init.height}}),view=await g.imageToBuffer!(out,{version:1});await g.publishBuffer('reference',view,{version:1});await g.releaseBuffer(view);return out;}};
});
// The expensive source really runs at 4097 squared, before the proxy pass.
export default <Composition width={320} height={180} fps={24} durationInFrames={4} background="transparent"><Stage id="large" width={4097} height={4097} factory={large}/><Stage id="proxy" factory={proxy} inputs={{surface:ref('large')}} inputTypes={{surface:'surface'}}/><Layer source={ref('proxy')}/></Composition>;
