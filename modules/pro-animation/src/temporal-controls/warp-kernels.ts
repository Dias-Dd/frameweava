// SPDX-License-Identifier: Apache-2.0 AND MIT
// Reuse original EffectCraft-adapted flow sampling and shared guarded Pair
// reconstruction. Only Timewarp-specific routing, matte and rejection are new.
import type {GpuPixelKernelSource,GpuPixelKernelSourceV2} from '../../../gpu-effects/pixel-types.ts';
import {sample} from '../native-motion-time/kernels.ts';
import {displacement} from '../../../native-effects/pa/kernels.ts';
// The original sampler reserves word8 for its rounding guard. Our controls use
// word8 for rejection, so move ONLY the runtime-zero guard to reserved word7.
const prefix=sample.code.slice(0,sample.code.indexOf('fn pixel(')).replaceAll('paramU32(8u)','paramU32(7u)');
const original=displacement.code.slice(0,displacement.code.indexOf('fn pixel('));
const third=original.replaceAll('bilinearPair','bilinearPair2').replaceAll('fn at(','fn at2(').replaceAll('pair(at(','pair(at2(').replaceAll('read0(','read2(').replaceAll('size0()','size2()').replaceAll('fn bilinear(','fn bilinear2(');
const thirdSampler=third.slice(third.indexOf('fn at2('));
const background=prefix.slice(prefix.indexOf('fn flow(')).replace('fn flow(','fn backgroundFlow(').replaceAll('data0(','data1(');
const channel=`fn matteValue(v:vec4f)->f32{let mode=paramU32(11u);var value=v.a;if(mode!=0u){var rgb=v.rgb;if(v.a!=0.){rgb/=v.a;}else{rgb=vec3f(0.);}if(mode==4u){value=dot(rgb,vec3f(paramF32(16u),paramF32(17u),paramF32(18u)));}else{value=rgb[mode-1u];}}return clamp(value,0.,1.);}`;
export const prepareWarp:GpuPixelKernelSource={abiVersion:1,id:'frameweave/pro-animation/temporal-controls/prepare',version:'1.0.0',inputCount:2,parameterWords:32,code:channel+`
fn pixel(p:vec2u)->vec4f{let q=clamp(vec2i(p),vec2i(i32(paramU32(20u)),i32(paramU32(21u))),vec2i(size0())-vec2i(i32(paramU32(22u)),i32(paramU32(23u)))-1);var v=read0(q);if(alpha0()==1u){v=vec4f(v.rgb*v.a,v.a);}if(paramU32(19u)!=0u){var mask=1.;if(paramU32(10u)!=0u){var m=read1(q);if(alpha1()==1u){m=vec4f(m.rgb*m.a,m.a);}mask=matteValue(m);if(paramU32(19u)==2u){mask=1.-mask;}}let gray=dot(v.rgb,vec3f(paramF32(16u),paramF32(17u),paramF32(18u)));return vec4f(vec3f(gray*mask),v.a*mask);}return v;}`};
export const reconstructWarp:GpuPixelKernelSourceV2={abiVersion:2,id:'frameweave/pro-animation/temporal-controls/reconstruct',version:'1.0.0',inputCount:3,parameterWords:32,dataInputs:[{type:'f32'},{type:'f32'},{type:'f32'}],code:prefix+thirdSampler+background+channel+`
fn tap(which:u32,p:vec2i)->Pair{if(which==0u){return pair(at0(p));}return pair(at1(p));}
fn weight(phase:u32,tap:u32)->Pair{let at=(phase*4u+tap)*2u;return constant(data2(at),data2(at+1u));}
fn sampleColour(which:u32,p:vec2f)->Pair{if(paramU32(2u)==0u){return tap(which,vec2i(floor(p+.5)));}if(paramU32(2u)==1u){if(which==0u){return bilinearPair0(pair(vec4f(p.x)),pair(vec4f(p.y)));}return bilinearPair1(pair(vec4f(p.x)),pair(vec4f(p.y)));}
 let low=vec2i(floor(p));let phase=vec2u(round(fract(p)*f32(paramU32(24u))));var result=pair(vec4f(0.));for(var y=0u;y<4u;y++){for(var x=0u;x<4u;x++){let w=multiply(weight(phase.x,x),weight(phase.y,y));result=add(result,multiply(tap(which,low+vec2i(i32(x)-1,i32(y)-1)),w));}}return result;}
fn blend(a:Pair,b:Pair)->Pair{return add(multiply(a,constant(paramF32(12u),paramF32(13u))),multiply(b,constant(paramF32(14u),paramF32(15u))));}
fn warped(p:vec2f,v:vec2f)->Pair{let t=paramF32(1u);if(paramU32(3u)!=0u){if(t<.5){return sampleColour(0u,p-v*t);}return sampleColour(1u,p+v*(1.-t));}return blend(sampleColour(0u,p-v*t),sampleColour(1u,p+v*(1.-t)));}
fn confidence(p:vec2f,v:vec2f)->f32{let a=rounded(sampleColour(0u,p));let b=rounded(sampleColour(1u,p+v));let scale=max(1.,max(max(max(abs(a.r),abs(a.g)),abs(a.b)),max(max(abs(b.r),abs(b.g)),abs(b.b))));let aa=a.rgb/scale;let bb=b.rgb/scale;let error=length(aa-bb)/(1./scale+length(aa)+length(bb));let threshold=paramF32(8u);if(threshold==0.){return 1.;}if(threshold==1.){return 0.;}return clamp(1.-error*threshold/(1.-threshold),0.,1.);}
fn pixel(p:vec2u)->vec4f{let xy=vec2f(p);let fg=flow(xy+.5);var bg=fg;var mask=1.;if(paramU32(10u)!=0u){bg=backgroundFlow(xy+.5);mask=matteValue(bilinear2(pair(vec4f(xy.x)),pair(vec4f(xy.y))));}
 let show=paramU32(9u);if(show==3u){return vec4f(vec3f(mask),1.);}if(show==4u){return vec4f(fg*(mask)+bg*(1.-mask),0.,1.);}let certainty=confidence(xy,fg)*mask+confidence(xy,bg)*(1.-mask);if(show==5u){return vec4f(vec3f(certainty),1.);}
 let front=multiply(warped(xy,fg),pair(vec4f(mask)));let back=multiply(warped(xy,bg),pair(vec4f(1.-mask)));var result=add(front,back);if(show==1u){result=front;}else if(show==2u){result=back;}else{let baseline=blend(sampleColour(0u,xy),sampleColour(1u,xy));result=add(multiply(result,pair(vec4f(certainty))),multiply(baseline,pair(vec4f(1.-certainty))));}let out=rounded(result);return vec4f(out.rgb,clamp(out.a,0.,1.));}`};
