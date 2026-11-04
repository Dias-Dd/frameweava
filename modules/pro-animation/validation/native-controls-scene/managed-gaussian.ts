// Real R1 consumer. Package identity/trust/install are explicit in this project.
import {processPa} from 'native-image-effects';
import type {NativeGpuScope} from '../../../native-gpu/authoring.ts';
import type {NativeMaskBlur} from '../../src/native-transitions/types.ts';
const copy={abiVersion:1 as const,id:'validation/transition-mask-ownership',version:'1.0.0',inputCount:1,parameterWords:0,code:'fn pixel(p:vec2u)->vec4f{return read0(vec2i(p));}'};
/** The managed recipe retains its last result and retires it at the next call.
 * Make an explicit owner-local F32 value before that lifecycle boundary. This
 * one GPU copy transfers result lifetime, without a readback or second owner. */
export function managedGaussian(gpu:NativeGpuScope):NativeMaskBlur{
 return async(input,o)=>{
  const value=await processPa(input,(image,fx)=>fx.blur(image,{...o,alpha:'opaque'}),{signal:o.signal});
  return gpu.run(await gpu.compile(copy),[value],{output:{format:'rgba32float',alpha:'opaque'},signal:o.signal});
 };
}
