// Validation-only binding of Agent-3's frozen, now integrated Gaussian kernel.
// It creates no owner and does not become a second production filter library.
import {gaussian} from '../../../native-effects/pa/kernels.ts';
import type {NativeGpuScope} from '../../../native-gpu/authoring.ts';
import type {NativeMaskBlur} from '../../src/native-transitions/types.ts';
import {withGpuResources} from '../../../gpu-effects/resource-arena.ts';
export function maskGaussian(gpu:NativeGpuScope):NativeMaskBlur{
 return async(input,o)=>withGpuResources(gpu,async arena=>{
  const radius=Math.ceil(3*o.radius),weights=Array.from({length:2*radius+1},(_,i)=>o.radius===0?1:Math.exp(-.5*((i-radius)/o.radius)**2));
  const sum=weights.reduce((a,b)=>a+b,0),parameters=new Uint32Array(774),f=new Float32Array(parameters.buffer);parameters[0]=radius;parameters[2]=1;
  weights.forEach((w,i)=>{const v=w/sum,hi=Math.fround(v);f[4+i*2]=hi;f[5+i*2]=v-hi;});
  const kernel=await gpu.compile(gaussian),h=arena.image(await gpu.run(kernel,[input],{parameters,output:{format:'rgba32float',alpha:'opaque'},signal:o.signal}));
  parameters[1]=1;return gpu.run(kernel,[h],{parameters,output:{format:'rgba32float',alpha:'opaque'},signal:o.signal});
 });
}
