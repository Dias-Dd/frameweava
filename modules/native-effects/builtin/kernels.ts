import type {GpuPixelKernelSourceV1,GpuPixelKernelSourceV2} from '../../gpu-effects/pixel-types.ts';
import {pixelCompensatedArithmetic} from '../../gpu-effects/pixel-effects.ts';
import {gaussian,displacement} from '../pa/kernels.ts';
import {blendKernel} from '../raster/kernels.ts';

// Exact frozen PA Gaussian, moving weights from the bounded uniform to the
// existing typed data ABI. No radius approximation or repeated small blurs.
if(!gaussian.code.includes('paramF32(4u+2u*')||!gaussian.code.includes('paramF32(5u+2u*'))throw Error('Frozen Gaussian weight binding changed');
export const gaussianData:GpuPixelKernelSourceV2={...gaussian,id:'frameweave/native-builtin/gaussian-data',abiVersion:2,parameterWords:4,dataInputs:[{type:'f32'}],code:gaussian.code.replaceAll('paramF32(4u+2u*','data0(2u*').replaceAll('paramF32(5u+2u*','data0(1u+2u*')};
const start=displacement.code.indexOf('\nfn pixel('),pairEnd=displacement.code.indexOf('fn scalar(');
if(start<0||pairEnd<0||!blendKernel.code.includes(pixelCompensatedArithmetic))throw Error('Frozen compensated sampler changed');
const sampled=displacement.code.slice(0,start).replaceAll('paramU32(8u)','paramU32(14u)');
const kernel=(name:string,body:string):GpuPixelKernelSourceV1=>({abiVersion:1,id:'frameweave/native-builtin/'+name,version:'1.0.0',inputCount:1,parameterWords:17,code:sampled+body});
export const transform=kernel('transform',`
fn pixel(p:vec2u)->vec4f{let x=pair(vec4f(f32(p.x)+.5));let y=pair(vec4f(f32(p.y)+.5));
let sx=add(add(multiply(x,scalar(2u)),multiply(y,scalar(6u))),scalar(10u));let sy=add(add(multiply(x,scalar(4u)),multiply(y,scalar(8u))),scalar(12u));
return rounded(multiply(bilinearPair(sx,sy),scalar(15u)));}`);
export const brightness=kernel('brightness',`
fn pixel(p:vec2u)->vec4f{let v=read0(vec2i(p));return vec4f(rounded(multiply(pair(v),scalar(2u))).rgb,v.a);}`);
export const threshold=kernel('threshold',`
fn pixel(p:vec2u)->vec4f{let v=read0(vec2i(p));if(v.a==0.){return vec4f(0.);}var y=pair(vec4f(0.));
for(var c=0u;c<3u;c++){y=add(y,multiply(pair(vec4f(v[c])),scalar(4u+2u*c)));}y=divide(y,pair(vec4f(v.a)));
let t=scalar(2u);var denominator=subtract(pair(vec4f(1.)),t);if(greater(pair(vec4f(.001)),denominator)){denominator=pair(vec4f(.001));}
var weight=divide(subtract(y,t),denominator);let zero=pair(vec4f(0.));let one=pair(vec4f(1.));if(greater(zero,weight)){weight=zero;}if(greater(weight,one)){weight=one;}
return rounded(multiply(pair(v),weight));}`);
// Existing compositor equation and F64 opacity split; protect the same original
// f32 rounding points already qualified by PA, without another pass or store.
export const blend:GpuPixelKernelSourceV1={...blendKernel,id:'frameweave/native-builtin/blend',parameterWords:6,code:blendKernel.code
 .replace(pixelCompensatedArithmetic,displacement.code.slice(0,pairEnd).replaceAll('paramU32(8u)','paramU32(3u)'))
 .replace('let alpha=add(sa,','let uncovered=add(subtract(one,pair(vec4f(read0(vec2i(p)).a))),multiply(pair(vec4f(read0(vec2i(p)).a)),scalar(4u)));let alpha=add(sa,')
 .replaceAll('subtract(one,sa)','uncovered')};
