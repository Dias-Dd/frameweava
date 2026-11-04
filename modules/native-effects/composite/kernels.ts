import type {GpuPixelKernelSourceV1} from '../../gpu-effects/pixel-types.ts';
import {math} from '../keying/kernels.ts';
import {guarded} from '../geometry/arithmetic.ts';
/** Altered EffectCraft common.wgsl blend equations, existing Pixel ABI1 and
 * compensated PM coverage. HDR/negative/zero-Alpha extensions are explicit. */
export const compositeKernel:GpuPixelKernelSourceV1={abiVersion:1,id:'frameweave/composite/coverage-color',version:'1.0.0',inputCount:2,parameterWords:128,code:guarded(math+`
fn randomValue(p:vec2u)->Pair{var h=(p.x*0x8da6b343u)^(p.y*0xd8163841u)^(paramU32(1u)*0xcb1ab31fu)^(paramU32(2u)*0x9e3779b9u);h^=h>>13u;h*=0x5bd1e995u;h^=h>>15u;return scalar(f32(h&0xffffffu)/16777216.);}
fn denominator(v:Pair)->Pair{if(greater(argP(1u),absPair(v))){if(greater(scalar(0.),v)){return negate(argP(1u));}return argP(1u);}return v;}
fn dodge(d:Pair,s:Pair)->Pair{return divide(d,denominator(subtract(scalar(1.),s)));}
fn burn(d:Pair,s:Pair)->Pair{return subtract(scalar(1.),divide(subtract(scalar(1.),d),denominator(s)));}
fn softCurve(d:Pair)->Pair{let a=absPair(d);var v=scalar(0.);if(!greater(a,scalar(.25))){v=multiply(add(multiply(subtract(times(a,16.),scalar(12.)),a),scalar(4.)),a);}else{v=sqrtPair(a);}if(greater(scalar(0.),d)){return negate(v);}return v;}
fn separable(d:Pair,s:Pair,mode:u32)->Pair{switch mode{
 case 0u:{if(!greater(s,scalar(.5))){return subtract(d,multiply(multiply(subtract(scalar(1.),times(s,2.)),d),subtract(scalar(1.),d)));}return add(d,multiply(subtract(times(s,2.),scalar(1.)),subtract(softCurve(d),d)));}
 case 1u:{return dodge(d,s);}
 case 2u:{return burn(d,s);}
 case 3u:{if(!greater(s,scalar(.5))){return burn(d,times(s,2.));}return dodge(d,subtract(times(s,2.),scalar(1.)));}
 case 4u:{return scalar(select(0.,1.,!greater(scalar(1.),add(d,s))));}
 case 11u:{return divide(d,denominator(s));}
 case 12u:{return subtract(scalar(1.),absPair(subtract(scalar(1.),add(s,d))));}
 case 13u:{return add(subtract(minP(s,d),maxP(s,d)),scalar(1.));}
 default:{return add(s,d);}
}}
fn minRGB(v:Pair)->Pair{return minP(minP(ch(v,0u),ch(v,1u)),ch(v,2u));}
fn maxRGB(v:Pair)->Pair{return maxP(maxP(ch(v,0u),ch(v,1u)),ch(v,2u));}
fn saturation(v:Pair)->Pair{return subtract(maxRGB(v),minRGB(v));}
fn setSaturation(v:Pair,s:Pair)->Pair{let range=saturation(v);if(!greater(range,scalar(0.))){return scalar(0.);}return multiply(divide(subtract(v,minRGB(v)),range),s);}
fn setLuminance(v:Pair,l:Pair)->Pair{return add(v,subtract(l,luminanceP(v)));}
fn blendColor(d:Pair,s:Pair,mode:u32)->Pair{let dl=luminanceP(d);let sl=luminanceP(s);switch mode{
 case 5u:{return setLuminance(setSaturation(s,saturation(d)),dl);}
 case 6u:{return setLuminance(setSaturation(d,saturation(s)),dl);}
 case 7u:{return setLuminance(s,dl);}
 case 8u:{return setLuminance(d,sl);}
 case 9u:{if(greater(sl,dl)){return s;}return d;}
 case 10u:{if(greater(dl,sl)){return s;}return d;}
 default:{return rgb(separable(ch(d,0u),ch(s,0u),mode),separable(ch(d,1u),ch(s,1u),mode),separable(ch(d,2u),ch(s,2u),mode),scalar(0.));}
}}
fn pixel(p:vec2u)->vec4f{let rs=read0(vec2i(p));let rd=read1(vec2i(p));let original=associate(rs,alpha0());let d=associate(rd,alpha1());let s=multiply(original,argP(0u));let sa=ch(s,3u);let da=ch(d,3u);let one=scalar(1.);let invSource=subtract(one,sa);let invDestination=subtract(one,da);let mode=paramU32(0u);var out=scalar(0.);
 switch mode{
 case 14u:{out=add(d,multiply(s,invDestination));}
 case 15u:{out=multiply(s,invDestination);}
 case 16u:{out=add(multiply(s,da),multiply(d,invSource));}
 case 17u:{out=add(multiply(d,sa),multiply(s,invDestination));}
 case 18u:{out=add(multiply(s,invDestination),multiply(d,invSource));}
 case 19u:{var f=one;if(greater(sa,scalar(0.))){f=minP(one,divide(invDestination,sa));}out=add(multiply(s,f),d);}
 default:{let base=add(s,multiply(d,invSource));if(mode==20u){if(!greater(sa,scalar(0.))){return published(base);}var cs=straight(original);if(alpha0()==1u){cs=pair(rs);}if(greater(sa,randomValue(p))){return published(rgb(ch(cs,0u),ch(cs,1u),ch(cs,2u),one));}return published(d);}out=base;if(greater(sa,scalar(0.))&&greater(da,scalar(0.))){var cs=straight(original);var cd=straight(d);if(alpha0()==1u){cs=pair(rs);}if(alpha1()==1u){cd=pair(rd);}let color=blendColor(cd,cs,mode);let delta=multiply(subtract(color,cs),multiply(sa,da));out=add(base,delta);}let a=add(sa,multiply(da,invSource));out=rgb(ch(out,0u),ch(out,1u),ch(out,2u),a);}
 }
 return published(out);
}
`)};
