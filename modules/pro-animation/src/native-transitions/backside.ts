// SPDX-License-Identifier: Apache-2.0
import type {NativeGpuScope} from '../../../native-gpu/authoring.ts';
import type {GpuPixelImage,GpuPixelKernelSource} from '../../../gpu-effects/pixel-types.ts';
import {arithmetic} from '../../../gpu-image-effects/resident/arithmetic.ts';
const centered:GpuPixelKernelSource={abiVersion:1,id:'frameweave/pro-animation/transition-backside-center',version:'1.0.0',inputCount:1,parameterWords:0,code:arithmetic+`
fn sample(p:vec2i)->vec4f{let v=read0(p);if(alpha0()==1u){return vec4f(v.rgb*v.a,v.a);}return v;}
fn pixel(p:vec2u)->vec4f{
 let q=vec2f(p)+(vec2f(size0())-vec2f(outputSize()))*.5;let cell=vec2i(floor(q));let f=fract(q);let x=pair(vec4f(f.x));let y=pair(vec4f(f.y));let one=pair(vec4f(1.));
 let upper=add(multiply(pair(sample(cell)),subtract(one,x)),multiply(pair(sample(cell+vec2i(1,0))),x));
 let lower=add(multiply(pair(sample(cell+vec2i(0,1))),subtract(one,x)),multiply(pair(sample(cell+vec2i(1))),x));
 return rounded(add(multiply(upper,subtract(one,y)),multiply(lower,y)));
}`};
/** Explicit frame-local centering, transparent outside; no scale or SDR bridge. */
export async function centerBackside(gpu:NativeGpuScope,image:GpuPixelImage,width:number,height:number,signal?:AbortSignal){
 return gpu.run(await gpu.compile(centered),[image],{output:{width,height,format:'rgba32float',alpha:'premultiplied'},signal});
}
