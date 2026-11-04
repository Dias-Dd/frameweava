// SPDX-License-Identifier: Apache-2.0
// Selected gl-transitions MIT equations adapted to WGSL/linear PM; exact upstream
// snapshots, changes and licenses are in provenance/native-transitions/.
import {arithmetic} from '../../../gpu-image-effects/resident/arithmetic.ts';
import type {GpuPixelKernelSourceV1} from '../../../gpu-effects/pixel-types.ts';

export const transitionNames=[
 'crossDissolve','fadeThroughColor','directionalWipe','clockWipe','irisWipe',
 'diamondWipe','boxWipe','venetianWipe','checkerWipe','randomBlocksWipe',
 'orderedDissolve','lumaWipe','alphaWipe','pushTransition','slideTransition',
 'splitTransition','zoomTransition','rotateTransition','rippleTransition',
 'displacementTransition','starWipe',
 'cardFlipWipe','glassWipe','gridWipe','imageWipe','jawsWipe','lightWipe','lineSweepWipe',
 'radialScaleWipe','scaleWipe','twisterTransition','warpTransition',
] as const;
export type TransitionName=typeof transitionNames[number];
// Compensated Taylor cosine on [0,pi], terms through x^24. Remainder <=
// pi^26/26! < 3e-14. Only used for the ill-conditioned edge-on twist inverse.
const cosineCoefficients:number[]=[];let factorial=1;for(let i=0;i<=24;i++){if(i>0)factorial*=i;if(i%2===0)cosineCoefficients.push((i%4===0?1:-1)/factorial);}
const coefficient=(n:number)=>`constant(${Math.fround(n)},${Math.fround(n-Math.fround(n))})`;
const cosineCode=`fn twistCos(x:Pair)->Pair{let square=multiply(x,x);var result=${coefficient(cosineCoefficients.at(-1)!)};${cosineCoefficients.slice(0,-1).reverse().map(c=>`result=add(${coefficient(c)},multiply(square,result));`).join('')}return result;}`;
const twistMath=`
struct Plane {x:Pair,y:Pair}
fn twistRotate(p:Plane,inverse:bool)->Plane{
 let c=constant(paramF32(9u),paramF32(14u));var s=constant(paramF32(10u),paramF32(15u));if(inverse){s=negate(s);}
 return Plane(subtract(multiply(c,p.x),multiply(s,p.y)),add(multiply(s,p.x),multiply(c,p.y)));
}
fn unitPair(p:Pair)->Pair{if(greater(pair(vec4f(0.)),p)){return pair(vec4f(0.));}if(greater(p,pair(vec4f(1.)))){return pair(vec4f(1.));}return p;}
`;
const common=arithmetic+`
fn pm(v:vec4f,alpha:u32)->vec4f{if(alpha==1u){return vec4f(v.rgb*v.a,v.a);}return v;}
fn a(p:vec2i)->vec4f{return pm(read0(p),alpha0());}
fn b(p:vec2i)->vec4f{return pm(read1(p),alpha1());}
fn blend(a:vec4f,b:vec4f,t:Pair)->vec4f{
 return rounded(add(multiply(pair(a),subtract(pair(vec4f(1.)),t)),multiply(pair(b),t)));
}
fn lerp(a:vec4f,b:vec4f,t:f32)->vec4f{return blend(a,b,pair(vec4f(t)));}
// Association BEFORE bilinear filtering, including transparent outside and
// native PM Alpha-zero emission. No interpolation of hidden straight RGB.
fn fetch(p:vec2i,which:u32,edge:bool)->vec4f{
 var q=p;if(edge){q=clamp(q,vec2i(0),vec2i(size0())-1);}
 if(which==0u){return a(q);}return b(q);
}
fn sampled(p:vec2f,which:u32)->vec4f{
 var q=p;let edge=paramU32(13u)!=0u;
 if(edge){q=clamp(q,vec2f(0.),vec2f(size0())-1.);}
 if(any(q<vec2f(-1.))||any(q>=vec2f(size0()))){return vec4f(0.);}
 let base=vec2i(floor(q));let t=q-vec2f(base);
 let upper=add(multiply(pair(fetch(base,which,edge)),pair(vec4f(1.-t.x))),multiply(pair(fetch(base+vec2i(1,0),which,edge)),pair(vec4f(t.x))));
 let lower=add(multiply(pair(fetch(base+vec2i(0,1),which,edge)),pair(vec4f(1.-t.x))),multiply(pair(fetch(base+vec2i(1),which,edge)),pair(vec4f(t.x))));
 return rounded(add(multiply(upper,pair(vec4f(1.-t.y))),multiply(lower,pair(vec4f(t.y)))));
}
fn coverage(rank:f32,progress:f32)->f32{
 let soft=paramF32(2u);let edge=progress*(1.+soft)-rank;
 if(soft==0.){return select(0.,1.,edge>=0.);}
 let t=clamp(edge/soft,0.,1.);return t*t*(3.-2.*t);
}
// Original EffectCraft common.wgsl hash_noise, fixed ec7ced1f / MIT.
fn hashCell(c:vec2u,seed:u32)->f32{var h=(c.x*0x8da6b343u)^(c.y*0xd8163841u)^(seed*0xcb1ab31fu);h=h^(h>>13u);h=h*0x5bd1e995u;h=h^(h>>15u);return f32(h&0x00ffffffu)/16777216.;}
fn rotate(p:vec2f,angle:f32)->vec2f{
 // Exact axis cases avoid driver trig error crossing a discontinuous tooth/grid seam.
 if(angle==0.){return p;}if(angle==1.5707963267948966){return vec2f(-p.y,p.x);}
 if(angle== -1.5707963267948966){return vec2f(p.y,-p.x);}if(abs(angle)==3.141592653589793){return -p;}
 let c=cos(angle);let s=sin(angle);return vec2f(c*p.x-s*p.y,s*p.x+c*p.y);
}
fn inside(p:vec2f)->bool{return all(p>=vec2f(-.5))&&all(p<vec2f(size0())-.5);}
`;
const bodies:Record<TransitionName,string>={
 crossDissolve:'return blend(outgoing,incoming,constant(paramF32(0u),paramF32(1u)));',
 fadeThroughColor:`let c=vec4f(paramF32(16u),paramF32(17u),paramF32(18u),paramF32(19u));if(t<.5){return lerp(outgoing,c,t*2.);}return lerp(c,incoming,(t-.5)*2.);`,
 directionalWipe:`let d=vec2f(paramF32(25u),paramF32(26u));let rank=dot(uv-.5,d)+.5;return lerp(outgoing,incoming,coverage(rank,t));`,
 clockWipe:`let d=vec2f(p)+.5-center*vec2f(size0());var angle=0.;if(all(d==vec2f(0.))){angle=paramF32(3u);}else if(d.x==0.){angle=select(-.25,.25,d.y>0.);}else if(d.y==0.){angle=select(.5,0.,d.x>0.);}else{angle=atan2(d.y,d.x)/6.283185307179586;}var phase=angle-paramF32(3u);phase=phase-floor(phase);return lerp(outgoing,incoming,coverage(phase,t));`,
 irisWipe:`let d=(uv-center)*vec2f(size0());let far=max(center,1.-center)*vec2f(size0());return lerp(outgoing,incoming,coverage(length(d)/length(far),t));`,
 diamondWipe:`let d=abs(uv-center)*vec2f(size0());let far=max(center,1.-center)*vec2f(size0());return lerp(outgoing,incoming,coverage((d.x+d.y)/(far.x+far.y),t));`,
 boxWipe:`let far=max(center,1.-center);let d=abs(uv-center)/far;return lerp(outgoing,incoming,coverage(max(d.x,d.y),t));`,
 venetianWipe:`let v=select(uv.x,uv.y,paramU32(11u)!=0u)*f32(paramU32(6u));return lerp(outgoing,incoming,coverage(fract(v),t));`,
 checkerWipe:`let q=uv*vec2f(f32(paramU32(6u)),f32(paramU32(7u)));let c=vec2u(floor(q));let f=fract(q);let rank=(f.x+f.y)*.25+f32((c.x+c.y)&1u)*.5;return lerp(outgoing,incoming,coverage(rank,t));`,
 randomBlocksWipe:`let c=vec2u(floor(uv*vec2f(f32(paramU32(6u)),f32(paramU32(7u)))));return lerp(outgoing,incoming,coverage(hashCell(c,paramU32(12u)),t));`,
 orderedDissolve:`let x=p.x&3u;let y=p.y&3u;let low=((x^y)&1u)*2u+(y&1u);let high=(((x>>1u)^(y>>1u))&1u)*2u+((y>>1u)&1u);let rank=(f32(low*4u+high)+.5)/16.;return lerp(outgoing,incoming,coverage(rank,t));`,
 lumaWipe:`let raw=read2(vec2i(p));var rgb=raw.rgb;if(alpha2()==0u){if(raw.a>0.){rgb/=raw.a;}else{rgb=vec3f(0.);}}let value=dot(rgb,vec3f(paramF32(22u),paramF32(23u),paramF32(24u)));let rank=clamp((value-paramF32(20u))/(paramF32(21u)-paramF32(20u)),0.,1.);return lerp(outgoing,incoming,coverage(rank,t));`,
 alphaWipe:`let value=read2(vec2i(p)).a;let rank=clamp((value-paramF32(20u))/(paramF32(21u)-paramF32(20u)),0.,1.);return lerp(outgoing,incoming,coverage(rank,t));`,
 pushTransition:`let d=vec2f(paramF32(25u),paramF32(26u))*vec2f(size0());let pa=vec2f(p)-t*d;let pb=vec2f(p)+(1.-t)*d;if(inside(pa)){return sampled(pa,0u);}return sampled(pb,1u);`,
 slideTransition:`let d=vec2f(paramF32(25u),paramF32(26u))*vec2f(size0());let pb=vec2f(p)+(1.-t)*d;if(inside(pb)){return sampled(pb,1u);}return outgoing;`,
 splitTransition:`var d=vec2f(0.);let axis=paramU32(11u);let right=uv[axis]>=.5;d[axis]=select(-1.,1.,right)*t*f32(size0()[axis])*.5;let pa=vec2f(p)-d;let half=f32(size0()[axis])*.5-.5;if(inside(pa)&&select(pa[axis]<half,pa[axis]>=half,right)){return sampled(pa,0u);}return incoming;`,
 zoomTransition:`let delta=vec2f(p)+.5-center*vec2f(size0());let base=center*vec2f(size0())-.5;let pa=base+delta*(1.+t*paramF32(8u));let pb=base+delta*(1.+(1.-t)*paramF32(8u));return lerp(sampled(pa,0u),sampled(pb,1u),t);`,
 rotateTransition:`let delta=vec2f(p)+.5-center*vec2f(size0());let base=center*vec2f(size0())-.5;let angle=paramF32(8u)*6.283185307179586;return lerp(sampled(base+rotate(delta,t*angle),0u),sampled(base+rotate(delta,(t-1.)*angle),1u),t);`,
 rippleTransition:`let d=(uv-.5)*vec2f(size0())/f32(size0().y);let dist=length(d);let wave=sin(6.283185307179586*(dist*paramF32(9u)-t*paramF32(10u)));let offset=d*wave*paramF32(8u)*t*(1.-t);return lerp(sampled(vec2f(p)+offset,0u),incoming,t);`,
 displacementTransition:`let raw=read2(vec2i(p));var rg=raw.rg;if(alpha2()==0u){if(raw.a>0.){rg/=raw.a;}else{rg=vec2f(paramF32(20u)+(paramF32(21u)-paramF32(20u))*.5);}}let offset=((rg-vec2f(paramF32(20u)))/(paramF32(21u)-paramF32(20u))*2.-1.)*paramF32(8u);return lerp(sampled(vec2f(p)+offset*t,0u),sampled(vec2f(p)-offset*(1.-t),1u),t);`,
 starWipe:`let d=(uv-center)*vec2f(size0());let far=max(center,1.-center)*vec2f(size0());var angle=0.;if(any(d!=vec2f(0.))){angle=atan2(d.y,d.x);}let r=paramF32(8u)+(1.-paramF32(8u))*(.5+.5*cos(angle*f32(paramU32(6u))));let rank=length(d)*paramF32(8u)/(length(far)*r);return lerp(outgoing,incoming,coverage(rank,t));`,
 // Original EffectCraft selected transition equations below. The original
 // source-only wipe is placed over the explicit incoming image, with native
 // PM sampling and exact progress endpoints. No original renderer/Host imported.
 cardFlipWipe:`let cells=vec2f(f32(paramU32(6u)),f32(paramU32(7u)));let cell=floor(uv*cells);let local=fract(uv*cells)-.5;let axis=paramU32(11u);let order=cell.x/max(cells.x-1.,1.);let stagger=paramF32(28u);let phase=clamp(t*(1.+stagger)-order*stagger,0.,1.);let k=cos(phase*3.141592653589793);if(abs(k)<.0001){return vec4f(0.);}var q=local;q[axis]/=abs(k);if(any(abs(q)>vec2f(.5))){return vec4f(0.);}let xy=(cell+.5+q)/cells*vec2f(size0())-.5;var v=sampled(xy,select(0u,1u,k<0.));v=vec4f(v.rgb*(1.-paramF32(29u)*(1.-abs(k))),v.a);return v;`,
 glassWipe:`let q=coverage(maskValue(vec2i(p)),t);let band=4.*q*(1.-q);let offset=maskGradient(vec2i(p))*paramF32(8u)*band*10.;return lerp(sampled(vec2f(p)+offset,0u),sampled(vec2f(p)-offset,1u),q);`,
 gridWipe:`let d=rotate(vec2f(p)+.5-center*vec2f(size0()),-paramF32(3u));let cs=vec2f(size0())/vec2f(f32(paramU32(6u)),f32(paramU32(7u)));let cc=(floor(d/cs)+.5)*cs;let far=max(center,1.-center)*vec2f(size0());var rank=length(cc)/length(far);if(paramU32(30u)==0u){rank=abs(cc.x)/length(far);}else if(paramU32(30u)==2u){rank=max(abs(cc.x),abs(cc.y))/max(far.x,far.y);}rank=clamp(rank,0.,1.);if(paramU32(31u)!=0u){rank=1.-rank;}let pr=clamp((t*1.25-rank)/.25,0.,1.);let q=abs((d-cc)/cs)*2.;let extent=1.-pr;let metric=max(q.x,q.y);var keep=select(0.,1.,metric<extent);let soft=paramF32(2u);if(soft>0.){keep=clamp((extent-metric)/soft+.5,0.,1.);}if(pr==0.){keep=1.;}return lerp(outgoing,incoming,1.-keep);`,
 imageWipe:`var rank=maskValue(vec2i(p));if(paramU32(31u)!=0u){rank=1.-rank;}return lerp(outgoing,incoming,coverage(rank,t));`,
 jawsWipe:`let d=rotate(vec2f(p)+.5-center*vec2f(size0()),-paramF32(3u));let width=f32(size0().x)/f32(paramU32(6u));let ph=fract(d.x/width);var tooth=1.-4.*abs(ph-.5);if(paramU32(30u)==1u){tooth=clamp(tooth*2.,-1.,1.);}else if(paramU32(30u)==2u){tooth=select(-1.,1.,ph<.5);}else if(paramU32(30u)==3u){tooth=sin(ph*6.283185307179586);}tooth*=paramF32(8u);let travel=t*(length(vec2f(size0()))+abs(paramF32(8u)));var v=d.y;var hit=true;if(v+travel<tooth){v+=travel;}else if(v-travel>=tooth){v-=travel;}else{hit=false;}if(!hit){return incoming;}let xy=rotate(vec2f(d.x,v),paramF32(3u))+center*vec2f(size0())-.5;return sampled(xy,0u);`,
 lightWipe:`let d=vec2f(paramF32(25u),paramF32(26u));let rank=dot(uv-.5,d)+.5;let q=coverage(rank,t);let color=vec3f(paramF32(16u),paramF32(17u),paramF32(18u));let band=4.*q*(1.-q)*paramF32(8u);let v=lerp(outgoing,incoming,q);return vec4f(v.rgb+color*band*v.a,v.a);`,
 lineSweepWipe:`let strips=f32(paramU32(7u));var k=floor(uv.y*strips);if(paramU32(31u)!=0u){k=strips-1.-k;}let slant=paramF32(8u);let rank=(uv.x+abs(slant)*select(k,strips-1.-k,slant<0.)/strips)/(1.+abs(slant));return lerp(outgoing,incoming,coverage(rank,t));`,
 radialScaleWipe:`let d=(uv-center)*vec2f(size0());let radius=length(d);let maxd=length(max(center,1.-center)*vec2f(size0()));var xy=vec2f(p);if(paramU32(31u)!=0u){let lim=(1.-t)*maxd;if(radius>=lim){return incoming;}xy=center*vec2f(size0())+d/(1.-t)-.5;}else{let hole=t*maxd;if(radius<=hole){return incoming;}let rs=(radius-hole)/(1.-t);xy=center*vec2f(size0())+d/radius*rs-.5;}return sampled(xy,0u);`,
 scaleWipe:`let direction=vec2f(paramF32(25u),paramF32(26u));let rank=dot(uv-.5,direction)+.5;let q=coverage(rank,t);let delta=(uv-.5)*vec2f(size0());let axis=direction/length(direction);let distance=dot(delta,axis);let stretch=1.+paramF32(8u)*t;var xy=vec2f(p);if(distance>0.){xy-=axis*(distance-distance/stretch);}return lerp(sampled(xy,0u),incoming,q);`,
 twisterTransition:`let origin=Plane(multiply(pair(vec4f(center.x)),pair(vec4f(f32(size0().x)))),multiply(pair(vec4f(center.y)),pair(vec4f(f32(size0().y)))));let delta=Plane(subtract(pair(vec4f(f32(p.x)+.5)),origin.x),subtract(pair(vec4f(f32(p.y)+.5)),origin.y));let d=twistRotate(delta,true);let half=constant(paramF32(6u),paramF32(7u));let order=unitPair(add(multiply(divide(d.x,half),pair(vec4f(.5))),pair(vec4f(.5))));let phase=unitPair(subtract(multiply(constant(paramF32(0u),paramF32(1u)),pair(vec4f(2.))),order));let kPair=twistCos(multiply(phase,${coefficient(Math.PI)}));let k=rounded(kPair).x;if(abs(k)<.0001){return vec4f(0.);}let mapped=twistRotate(Plane(d.x,divide(d.y,kPair)),false);let xy=vec2f(rounded(subtract(add(mapped.x,origin.x),pair(vec4f(.5)))).x,rounded(subtract(add(mapped.y,origin.y),pair(vec4f(.5)))).x);let v=sampled(xy,select(0u,1u,k<0.));return vec4f(v.rgb*(1.-paramF32(29u)*(1.-abs(k))),v.a);`,
 warpTransition:`let q=coverage(maskValue(vec2i(p)),t);let g=maskGradient(vec2i(p))*paramF32(8u);let outOffset=g*q;var inOffset=g*(1.-q);if(paramU32(30u)==1u){inOffset=-inOffset;}else if(paramU32(30u)==2u){inOffset=vec2f(-inOffset.y,inOffset.x);}return lerp(sampled(vec2f(p)+outOffset,0u),sampled(vec2f(p)+inOffset,1u),q);`,
};
const maskHelpers=`
fn maskValue(p:vec2i)->f32{
 let raw=read2(clamp(p,vec2i(0),vec2i(size0())-1));var rgb=raw.rgb;
 if(alpha2()==0u){if(raw.a>0.){rgb/=raw.a;}else{rgb=vec3f(0.);}}
 let kind=paramU32(27u);var value=dot(rgb,vec3f(paramF32(22u),paramF32(23u),paramF32(24u)));
 if(kind<3u){value=rgb[kind];}else if(kind==3u){value=raw.a;}else if(kind>=5u){
  let high=max(max(rgb.r,rgb.g),rgb.b);let low=min(min(rgb.r,rgb.g),rgb.b);let chroma=high-low;
  value=(high+low)*.5;
  if(kind==6u){value=0.;if(chroma>0.){if(high==rgb.r){value=(rgb.g-rgb.b)/chroma;}else if(high==rgb.g){value=(rgb.b-rgb.r)/chroma+2.;}else{value=(rgb.r-rgb.g)/chroma+4.;}value=fract(value/6.);}}
  if(kind==7u){value=0.;let scale=max(max(abs(rgb.r),abs(rgb.g)),abs(rgb.b));if(scale>0.){value=chroma/scale;}}
 }
 return clamp((value-paramF32(20u))/(paramF32(21u)-paramF32(20u)),0.,1.);
}
fn maskGradient(p:vec2i)->vec2f{return vec2f(maskValue(p+vec2i(1,0))-maskValue(p-vec2i(1,0)),maskValue(p+vec2i(0,1))-maskValue(p-vec2i(0,1)))*.5;}
`;
export function transitionKernel(name:TransitionName):GpuPixelKernelSourceV1 {
 const inputCount=['lumaWipe','alphaWipe','displacementTransition','glassWipe','imageWipe','warpTransition'].includes(name)?3:2;
 return {abiVersion:1,id:'frameweave/pro-animation/transitions/'+name,version:'1.0.0',inputCount,parameterWords:32,
  code:common+(name==='twisterTransition'?cosineCode+twistMath:'')+(inputCount===3?maskHelpers:'')+`fn pixel(p:vec2u)->vec4f{
   let outgoing=a(vec2i(p));let incoming=b(vec2i(p));let t=paramF32(0u)+paramF32(1u);
   if(t<=0.){return outgoing;}if(t>=1.){return incoming;}
   let uv=(vec2f(p)+.5)/vec2f(size0());let center=vec2f(paramF32(4u),paramF32(5u));
   ${bodies[name]}
  }`};
}
