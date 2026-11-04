import type {GpuComputeKernelSource} from '../../gpu-effects/compute-types.ts';
import type {GpuPixelKernelSourceV2} from '../../gpu-effects/pixel-types.ts';
import {channelMath} from './kernels.ts';
import {guarded} from '../geometry/arithmetic.ts';
const read={type:'f32',access:'read'} as const,write={type:'f32',access:'read_write'} as const;
const source=channelMath+`
fn raw(i:u32)->Pair{return associate(vec4f(load0(i*4u),load0(i*4u+1u),load0(i*4u+2u),load0(i*4u+3u)),paramU32(2u));}
fn column(v:Pair,base:u32)->Pair{return rgb(dotRGB(v,triple(base)),dotRGB(v,triple(base+3u)),dotRGB(v,triple(base+6u)),scalar(0.));}
`;
export const packChannels:GpuComputeKernelSource={abiVersion:1,id:'frameweave/closure-filters/channel-pack',version:'1.0.0',bindings:[read,write],parameterWords:128,workgroupSize:[8,8,1],code:guarded(source+`
fn compute(p:vec3u,_l:vec3u,_g:vec3u){let n=p.y*paramU32(0u)+p.x;let v=raw(n);let a=ch(v,3u);var c=straight(v);if(!greater(a,scalar(0.))){c=v;}var offset=scalar(0.);var span=scalar(1.);if(paramU32(3u)==3u){let hsl=encodeHsl(c);c=rgb(hsl.h,hsl.s,hsl.l,scalar(0.));offset=hsl.offset;span=hsl.span;}else{c=column(c,0u);}let values=array<Pair,6>(ch(c,0u),ch(c,1u),ch(c,2u),a,offset,span);for(var j=0u;j<6u;j++){store1(n*12u+j*2u,values[j].hi.x);store1(n*12u+j*2u+1u,values[j].lo.x);}}
`)};
export const unpackChannels:GpuPixelKernelSourceV2={abiVersion:2,id:'frameweave/closure-filters/channel-decode',version:'1.0.0',inputCount:0,dataInputs:[{type:'f32'}],parameterWords:128,code:guarded(channelMath+`
fn lane(i:u32)->Pair{return constant(data0(i*2u),data0(i*2u+1u));}
fn pixel(p:vec2u)->vec4f{let n=(p.y*outputSize().x+p.x)*6u;let a=lane(n+3u);let encoded=rgb(lane(n),lane(n+1u),lane(n+2u),scalar(0.));var c=rgb(dotRGB(encoded,triple(0u)),dotRGB(encoded,triple(3u)),dotRGB(encoded,triple(6u)),scalar(0.));if(paramU32(3u)==3u){c=decodeHsl(HSL(lane(n),lane(n+1u),lane(n+2u),lane(n+4u),lane(n+5u)));}if(greater(a,scalar(0.))){return published(rgba(c,a));}return published(rgb(ch(c,0u),ch(c,1u),ch(c,2u),a));}
`)};
/** Two-stage compensated moments: one work item per row, then one per image.
 * The reduction stays on the same owner. It is not a CPU image readback. */
export const momentsRows:GpuComputeKernelSource={abiVersion:1,id:'frameweave/closure-filters/moments-rows',version:'1.0.0',bindings:[read,write],parameterWords:128,workgroupSize:[64,1,1],code:guarded(source+`
fn compute(p:vec3u,_l:vec3u,_g:vec3u){var sum=scalar(0.);var square=scalar(0.);var weight=scalar(0.);for(var x=0u;x<paramU32(0u);x++){let v=raw(p.x*paramU32(0u)+x);let a=ch(v,3u);let c=straight(v);sum=add(sum,multiply(c,a));square=add(square,multiply(multiply(c,c),a));weight=add(weight,a);}for(var j=0u;j<3u;j++){store1(p.x*14u+j*2u,sum.hi[j]);store1(p.x*14u+j*2u+1u,sum.lo[j]);store1(p.x*14u+6u+j*2u,square.hi[j]);store1(p.x*14u+7u+j*2u,square.lo[j]);}store1(p.x*14u+12u,weight.hi.x);store1(p.x*14u+13u,weight.lo.x);}
`)};
export const momentsFinish:GpuComputeKernelSource={abiVersion:1,id:'frameweave/closure-filters/moments-finish',version:'1.0.0',bindings:[read,read,write],parameterWords:128,workgroupSize:[1,1,1],code:guarded(channelMath+`
fn value(i:u32,which:u32)->Pair{if(which==0u){return constant(load0(i),load0(i+1u));}return constant(load1(i),load1(i+1u));}
fn compute(p:vec3u,_l:vec3u,_g:vec3u){for(var which=0u;which<2u;which++){var weight=scalar(0.);for(var row=0u;row<paramU32(1u);row++){weight=add(weight,value(row*14u+12u,which));}for(var c=0u;c<3u;c++){var sum=scalar(0.);var square=scalar(0.);for(var row=0u;row<paramU32(1u);row++){sum=add(sum,value(row*14u+c*2u,which));square=add(square,value(row*14u+6u+c*2u,which));}var mean=scalar(0.);var variance=scalar(0.);if(greater(weight,scalar(0.))){mean=divide(sum,weight);variance=maxP(subtract(divide(square,weight),multiply(mean,mean)),scalar(0.));}let i=which*12u+c*2u;store2(i,mean.hi.x);store2(i+1u,mean.lo.x);store2(i+6u,variance.hi.x);store2(i+7u,variance.lo.x);}}}
`)};
export const calibration:GpuComputeKernelSource={abiVersion:1,id:'frameweave/closure-filters/calibration',version:'1.0.0',bindings:[read,read,write],parameterWords:128,workgroupSize:[1,1,1],code:guarded(channelMath+`
fn colorAt(n:u32,which:u32)->Pair{var v=vec4f(load0(n),load0(n+1u),load0(n+2u),load0(n+3u));if(which==1u){v=vec4f(load1(n),load1(n+1u),load1(n+2u),load1(n+3u));}return straight(associate(v,select(paramU32(2u),paramU32(3u),which==1u)));}
fn compute(p:vec3u,_l:vec3u,_g:vec3u){var sum=scalar(0.);var dest=scalar(0.);var square=scalar(0.);var cross=scalar(0.);var count=scalar(0.);for(var j=0u;j<3u;j++){let x=u32(clamp(round(arg(j*2u)),0.,f32(paramU32(0u)-1u)));let y=u32(clamp(round(arg(j*2u+1u)),0.,f32(paramU32(1u)-1u)));let i=(y*paramU32(0u)+x)*4u;if(load0(i+3u)<=0.||load1(i+3u)<=0.){continue;}let a=colorAt(i,0u);let b=colorAt(i,1u);sum=add(sum,a);dest=add(dest,b);square=add(square,multiply(a,a));cross=add(cross,multiply(a,b));count=add(count,scalar(1.));}for(var c=0u;c<3u;c++){var gain=scalar(1.);var offset=scalar(0.);if(greater(count,scalar(0.))){let mean=divide(ch(sum,c),count);let reference=divide(ch(dest,c),count);let variance=subtract(divide(ch(square,c),count),multiply(mean,mean));if(greater(variance,argP(6u))){gain=divide(subtract(divide(ch(cross,c),count),multiply(mean,reference)),variance);}offset=subtract(reference,multiply(mean,gain));}store2(c*4u,gain.hi.x);store2(c*4u+1u,gain.lo.x);store2(c*4u+2u,offset.hi.x);store2(c*4u+3u,offset.lo.x);}}
`)};
