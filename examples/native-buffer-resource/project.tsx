import {Composition,Stage,Layer,Resource,ref} from '@frameweave/engine';
import {defineNativeStage,linear709} from '@frameweave/engine/native';
export const bytes=defineNativeStage(async init=>{
 const asset=await init.gpu.importBufferResource({version:1,id:'bytes',profile:'raw-bytes-v1',bytes:13,byteOffset:3,byteLength:5});
 const k=await init.gpu.compile({abiVersion:2,id:'example/binary-view',version:'1.0.0',inputCount:0,dataInputs:[{type:'u32'}],parameterWords:0,code:'fn pixel(p:vec2u)->vec4f{return vec4f(f32(data0(0u)&255u),-.25,4.5,.5);}'});
 return {async renderAt(){return init.gpu.run(k,[],{data:[asset.buffer],output:{width:init.width,height:init.height,format:'rgba32float',alpha:'straight',color:linear709}});},dispose(){return init.gpu.releaseBuffer(asset.buffer);}};
});
export default <Composition width={160} height={90} fps={24} durationInFrames={8} background="transparent"><Resource id="bytes" src="./asset.bin" kind="file"/><Stage id="bytes" factory={bytes}/><Layer source={ref('bytes')}/></Composition>;
