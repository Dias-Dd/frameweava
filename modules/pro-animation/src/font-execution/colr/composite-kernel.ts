// SPDX-License-Identifier: Apache-2.0
// COLR numeric IDs mapped explicitly. Reuse the shipped A3 compensated blend helpers;
// font-local W3C bounded-color rules are distinct from generic HDR image-filter semantics.
import {compositeKernel} from '../../../../native-effects/composite/kernels.ts';
import type {GpuPixelKernelSourceV1} from '../../../../gpu-effects/pixel-types.ts';
const at=compositeKernel.code.indexOf('fn pixel(p:vec2u)');if(at<0)throw Error('Qualified composite helper boundary changed');
export const colrCompositeKernel:GpuPixelKernelSourceV1={abiVersion:1,id:'frameweave/pro-animation/colr/composite',version:'1.0.0',inputCount:2,parameterWords:128,code:compositeKernel.code.slice(0,at)+`
fn colrBounded(v:Pair)->bool{let c=rounded(v).rgb;return all(c>=vec3f(0.))&&all(c<=vec3f(1.));}
fn colrClip(v:Pair)->Pair{let l=luminanceP(v);let n=minRGB(v);let x=maxRGB(v);var c=v;if(greater(scalar(0.),n)){c=add(l,divide(multiply(subtract(c,l),l),subtract(l,n)));}if(greater(x,scalar(1.))){c=add(l,divide(multiply(subtract(c,l),subtract(scalar(1.),l)),subtract(x,l)));}return c;}
fn colrSetLum(v:Pair,l:Pair,bounded:bool)->Pair{let c=setLuminance(v,l);if(bounded){return colrClip(c);}return c;}
fn colrHard(d:Pair,s:Pair)->Pair{if(!greater(s,scalar(.5))){return times(multiply(d,s),2.);}return subtract(scalar(1.),times(multiply(subtract(scalar(1.),d),subtract(scalar(1.),s)),2.));}
fn colrBlend(d:Pair,s:Pair,mode:u32)->Pair{
 let bounded=colrBounded(d)&&colrBounded(s);let dl=luminanceP(d);let sl=luminanceP(s);
 if(mode==24u){return colrSetLum(setSaturation(s,saturation(d)),dl,bounded);}if(mode==25u){return colrSetLum(setSaturation(d,saturation(s)),dl,bounded);}if(mode==26u){return colrSetLum(s,dl,bounded);}if(mode==27u){return colrSetLum(d,sl,bounded);}
 var result=scalar(0.);for(var k=0u;k<3u;k++){let dc=ch(d,k);let sc=ch(s,k);var value=scalar(0.);
 switch mode{
  case 13u:{value=subtract(add(dc,sc),multiply(dc,sc));}
  case 14u:{value=colrHard(sc,dc);}
  case 15u:{value=minP(dc,sc);}
  case 16u:{value=maxP(dc,sc);}
  case 17u:{if(bounded){if(!greater(dc,scalar(0.))){value=scalar(0.);}else if(!greater(scalar(1.),sc)){value=scalar(1.);}else{value=minP(scalar(1.),divide(dc,subtract(scalar(1.),sc)));}}else{value=dodge(dc,sc);}}
  case 18u:{if(bounded){if(!greater(scalar(1.),dc)){value=scalar(1.);}else if(!greater(sc,scalar(0.))){value=scalar(0.);}else{value=subtract(scalar(1.),minP(scalar(1.),divide(subtract(scalar(1.),dc),sc)));}}else{value=burn(dc,sc);}}
  case 19u:{value=colrHard(dc,sc);}
  case 20u:{value=separable(dc,sc,0u);}
  case 21u:{value=absPair(subtract(dc,sc));}
  case 22u:{value=subtract(add(dc,sc),times(multiply(dc,sc),2.));}
  case 23u:{value=multiply(dc,sc);}
  default:{value=sc;}
 }
 result.hi[k]=value.hi.x;result.lo[k]=value.lo.x;
 }return result;
}
fn pixel(p:vec2u)->vec4f{
 let s=pair(read0(vec2i(p)));let d=pair(read1(vec2i(p)));let sa=ch(s,3u);let da=ch(d,3u);let one=scalar(1.);let isub=subtract(one,sa);let dsub=subtract(one,da);let mode=paramU32(0u);var out=scalar(0.);
 switch mode{
  case 0u:{return vec4f(0.);}
  case 1u:{return published(s);}
  case 2u:{return published(d);}
  case 3u:{out=add(s,multiply(d,isub));}
  case 4u:{out=add(d,multiply(s,dsub));}
  case 5u:{out=multiply(s,da);}
  case 6u:{out=multiply(d,sa);}
  case 7u:{out=multiply(s,dsub);}
  case 8u:{out=multiply(d,isub);}
  case 9u:{out=add(multiply(s,da),multiply(d,isub));}
  case 10u:{out=add(multiply(d,sa),multiply(s,dsub));}
  case 11u:{out=add(multiply(s,dsub),multiply(d,isub));}
  case 12u:{out=add(s,d);}
  default:{let alpha=add(sa,multiply(da,isub));let base=add(multiply(s,dsub),multiply(d,isub));if(greater(sa,scalar(0.))&&greater(da,scalar(0.))){out=add(base,multiply(colrBlend(straight(d),straight(s),mode),multiply(sa,da)));}else{out=base;}out=rgb(ch(out,0u),ch(out,1u),ch(out,2u),alpha);}
 }
 return published(out);
}
`};
