// SPDX-License-Identifier: Apache-2.0
// Font-specific brush adapter; original qualified A3 compensated coordinate arithmetic is reused unchanged.
import {math} from '../../../../native-effects/keying/kernels.ts';
import {guarded} from '../../../../native-effects/geometry/arithmetic.ts';
import type {GpuPixelKernelSourceV2} from '../../../../gpu-effects/pixel-types.ts';
export const colrGradientKernel:GpuPixelKernelSourceV2={abiVersion:2,id:'frameweave/pro-animation/colr/brush',version:'1.0.0',inputCount:0,parameterWords:128,dataInputs:[{type:'f32'}],code:guarded(math+`
fn item(i:u32,j:u32)->Pair{let at=i*10u+j*2u;return constant(data0(at),data0(at+1u));}
fn ink(i:u32)->Pair{return rgb(item(i,1u),item(i,2u),item(i,3u),item(i,4u));}
fn line(input:Pair)->vec4f{
 let count=paramU32(2u);if(count==0u){return vec4f(0.);}if(count==1u){return published(ink(0u));}
 let lo=item(0u,0u);let hi=item(count-1u,0u);var t=input;let extend=paramU32(1u);
 if(extend!=0u){let width=subtract(hi,lo);if(!greater(width,scalar(0.))){return vec4f(0.);}if(greater(lo,t)||greater(t,hi)){let relative=divide(subtract(t,lo),width);let cycle=floorP(relative);let f=subtract(relative,cycle);
  if(extend==1u){if(greater(t,hi)&&rounded(f).x==0.){t=hi;}else{t=add(lo,multiply(f,width));}}
  else{let parity=subtract(cycle,times(floorP(times(cycle,.5)),2.));if(greater(parity,scalar(0.))){t=subtract(hi,multiply(f,width));}else{t=add(lo,multiply(f,width));}}
 }}
 if(greater(lo,t)){return published(ink(0u));}if(!greater(hi,t)){return published(ink(count-1u));}
 var lower=0u;var upper=count;while(lower<upper){let mid=lower+(upper-lower)/2u;if(!greater(item(mid,0u),t)){lower=mid+1u;}else{upper=mid;}}
 let left=lower-1u;let amount=divide(subtract(t,item(left,0u)),subtract(item(lower,0u),item(left,0u)));return published(mixP(ink(left),ink(lower),amount));
}
fn pixel(p:vec2u)->vec4f{
 if(paramU32(3u)!=0u||paramU32(2u)==0u){return vec4f(0.);}if(paramU32(0u)==0u){return line(scalar(0.));}
 let px=scalar(f32(p.x)+.5);let py=scalar(f32(p.y)+.5);let x=dot3(px,py,0u);let y=dot3(px,py,3u);
 let qx=subtract(x,argP(6u));let qy=subtract(y,argP(7u));var t=scalar(0.);
 if(paramU32(0u)==1u){let dx=subtract(argP(8u),argP(6u));let dy=subtract(argP(9u),argP(7u));let length2=add(multiply(dx,dx),multiply(dy,dy));if(!greater(length2,scalar(0.))){return vec4f(0.);}t=divide(add(multiply(qx,dx),multiply(qy,dy)),length2);}
 else if(paramU32(0u)==2u){let r0=argP(8u);let r1=argP(11u);let dx=subtract(argP(9u),argP(6u));let dy=subtract(argP(10u),argP(7u));let dr=subtract(r1,r0);if(rounded(dx).x==0.&&rounded(dy).x==0.&&rounded(dr).x==0.||rounded(r0).x==0.&&rounded(r1).x==0.){return vec4f(0.);}
  let a=subtract(add(multiply(dx,dx),multiply(dy,dy)),multiply(dr,dr));let b=times(add(add(multiply(qx,dx),multiply(qy,dy)),multiply(r0,dr)),-2.);let c=subtract(add(multiply(qx,qx),multiply(qy,qy)),multiply(r0,r0));var first=scalar(0.);var second=scalar(0.);var validFirst=false;var validSecond=false;
  if(rounded(a).x==0.){if(rounded(b).x==0.){return vec4f(0.);}first=divide(negate(c),b);validFirst=greater(add(r0,multiply(dr,first)),scalar(0.));}
  else{let d=subtract(multiply(b,b),times(multiply(a,c),4.));if(greater(scalar(0.),d)){return vec4f(0.);}let root=sqrtPair(d);var q=times(add(b,root),-.5);if(greater(scalar(0.),b)){q=times(subtract(b,root),-.5);}if(rounded(q).x==0.){first=divide(negate(b),times(a,2.));second=first;}else{first=divide(q,a);second=divide(c,q);}validFirst=greater(add(r0,multiply(dr,first)),scalar(0.));validSecond=greater(add(r0,multiply(dr,second)),scalar(0.));}
  if(!validFirst&&!validSecond){return vec4f(0.);}if(validSecond&&(!validFirst||greater(second,first))){t=second;}else{t=first;}
 }else{let degrees=constant(57.295780181884766,-6.688024427603523e-07);var angle=multiply(atan2Pair(negate(qy),qx),degrees);if(greater(scalar(0.),angle)){angle=add(angle,scalar(360.));}if(!greater(scalar(360.),angle)){angle=scalar(0.);}let span=subtract(argP(9u),argP(8u));if(rounded(span).x==0.){if(paramU32(1u)!=0u){return vec4f(0.);}if(!greater(angle,argP(8u))){return published(ink(0u));}return published(ink(paramU32(2u)-1u));}t=divide(subtract(angle,argP(8u)),span);}
 return line(t);
}`)};
