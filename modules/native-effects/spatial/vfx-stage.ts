import {defineNativeStage} from '../../native-gpu/authoring.ts';
import {nativeSpatialFrame} from './frame.ts';
import {inputImage,vfxCase,originalVfxFrame} from './vfx-cases.ts';
export const nativeVfxChecks=defineNativeStage<Record<string,never>,{format?:'rgba16float'|'rgba32float';compareOriginal?:boolean}>(init=>({async renderAt(context,_inputs,props){const format=props.format??'rgba32float',input=await inputImage(init.gpu,init.width,init.height,format);try{const result=await vfxCase(context.globalFrame%15,nativeSpatialFrame(init,context).vfx,input,init.width,init.height,format);if(!props.compareOriginal)return result;
 // Direct, unchanged original algorithm on the SAME Native owner: this proves
 // binding/parameter equality without conflating cross-API driver arithmetic.
 const original=await vfxCase(context.globalFrame%15,originalVfxFrame(init.gpu,context),input,init.width,init.height,format),pair=await init.gpu.compile({abiVersion:1,id:'fixture/native-vfx-pair',version:'1.0.0',inputCount:2,parameterWords:1,code:'fn pixel(p:vec2u)->vec4f{return select(read0(vec2i(p)),read1(vec2i(p)),paramU32(0u)!=0u);}'});return init.gpu.run(pair,[result,original],{parameters:Uint32Array.of(0)});
 }finally{await init.gpu.release(input);}}}));
