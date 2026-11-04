import type {GpuPixelKernelSourceV1} from '../../../gpu-effects/pixel-types.ts';
import {arithmetic} from '../arithmetic.ts';
// EffectCraft ec7ced1f / MIT: box/directional from kernels.wgsl, pointwise
// thresholds/posterization from fx_stylize.wgsl, component morphology from
// fx_noise.wgsl. See sources.json. The same public scope owns every pass.
export const common=arithmetic+`
fn scalar(v:f32)->Pair{return pair(vec4f(v));}
fn bad()->vec4f{return vec4f(bitcast<f32>(0x7fc00000u|(outputSize().x&1u)));}
fn normal(v:vec4f)->bool{let b=bitcast<vec4u>(v)&vec4u(0x7fffffffu);return all((b==vec4u(0u))|((b>=vec4u(0x00800000u))&(b<vec4u(0x7f800000u))));}
fn pm(v:vec4f)->vec4f{if(!normal(v)){return bad();}if(alpha0()==1u){let c=v.rgb*v.a;if(!normal(vec4f(c,v.a))||(v.a>0.&&any((c==vec3f(0.))&(v.rgb!=vec3f(0.))))){return bad();}return vec4f(c,v.a);}return v;}
fn input(p:vec2i,edge:bool)->vec4f{var q=p;if(edge){q=clamp(p,vec2i(0),vec2i(size0())-1);}return pm(read0(q));}
fn coeff(i:u32)->Pair{return constant(paramF32(i),paramF32(i+1u));}
fn minimum(a:Pair,b:Pair)->Pair{if(greater(a,b)){return b;}return a;}
fn maximum(a:Pair,b:Pair)->Pair{if(greater(a,b)){return a;}return b;}
fn bounded(a:Pair,lo:f32,hi:f32)->Pair{return minimum(maximum(a,scalar(lo)),scalar(hi));}
fn interpolate(a:Pair,b:Pair,t:Pair)->Pair{return add(multiply(a,subtract(scalar(1.),t)),multiply(b,t));}
fn luma(v:vec4f,base:u32)->Pair{var y=scalar(0.);for(var c=0u;c<3u;c++){y=add(y,multiply(scalar(v[c]),coeff(base+2u*c)));}return y;}
fn absolute(v:Pair)->Pair{if(greater(scalar(0.),v)){return negate(v);}return v;}
fn root(v:Pair)->Pair{if(any((bitcast<vec4u>(v.hi)&vec4u(0x7f800000u))==vec4u(0x7f800000u))||any((bitcast<vec4u>(v.lo)&vec4u(0x7f800000u))==vec4u(0x7f800000u))){return pair(bad());}if(!greater(v,scalar(0.))){return scalar(0.);}let r=sqrt(rounded(v).x);return add(scalar(r),divide(subtract(v,multiply(scalar(r),scalar(r))),scalar(2.*r)));}
fn floor_pair(v:Pair)->f32{var r=floor(v.hi.x);let t=subtract(v,scalar(r));if(greater(scalar(0.),t)){r-=1.;}else if(!greater(scalar(1.),t)){r+=1.;}return r;}
fn bilinear(x:Pair,y:Pair,edge:bool)->Pair{
 var qx=x;var qy=y;let dims=vec2i(size0());if(edge){qx=bounded(x,0.,f32(dims.x-1));qy=bounded(y,0.,f32(dims.y-1));}
 if(greater(scalar(-1.),qx)||!greater(scalar(f32(dims.x)),qx)||greater(scalar(-1.),qy)||!greater(scalar(f32(dims.y)),qy)){return scalar(0.);}
 let ix=floor_pair(qx);let iy=floor_pair(qy);let tx=subtract(qx,scalar(ix));let ty=subtract(qy,scalar(iy));let p=vec2i(i32(ix),i32(iy));
 return interpolate(interpolate(pair(input(p,edge)),pair(input(p+vec2i(1,0),edge)),tx),interpolate(pair(input(p+vec2i(0,1),edge)),pair(input(p+vec2i(1),edge)),tx),ty);
}
`;
const kernel=(id:string,words:number,body:string):GpuPixelKernelSourceV1=>({abiVersion:1,id:'frameweave/foundations/'+id,version:'1.0.0',inputCount:1,parameterWords:words,code:common+body});
// Same uniform rectangular mean as EffectCraft box_pass; centered direct in-frame
// scan avoids running-sum drift and analytically accounts for huge edge repeats.
export const boxAxisKernel=kernel('box-axis',5,`
fn pixel(p:vec2u)->vec4f{let axis=paramU32(3u);let n=select(size0().x,size0().y,axis!=0u);let at=select(p.x,p.y,axis!=0u);let r=paramF32(0u);let extent=i32(min(r,f32(n)));let lo=max(0,i32(at)-extent);let hi=min(i32(n)-1,i32(at)+extent);let inv=coeff(1u);var sum=scalar(0.);
 for(var j=lo;j<=hi;j++){var q=vec2i(p);q[axis]=j;sum=add(sum,multiply(pair(input(q,false)),inv));}
 if(paramU32(4u)!=0u){let left=maximum(subtract(scalar(r),scalar(f32(at))),scalar(0.));let right=maximum(subtract(scalar(r),scalar(f32(n-1u-at))),scalar(0.));var first=vec2i(p);first[axis]=0;var last=vec2i(p);last[axis]=i32(n)-1;sum=add(sum,multiply(pair(input(first,false)),multiply(left,inv)));sum=add(sum,multiply(pair(input(last,false)),multiply(right,inv)));}return rounded(sum);}`);
// EffectCraft directional sampler; compensated coordinates/bilinear weights and
// reciprocal averaging replace its driver-dependent F32 running accumulation.
export const directionalKernel=kernel('directional',8,`
fn pixel(p:vec2u)->vec4f{let n=paramU32(6u);if(n==1u||paramF32(4u)==0.){return input(vec2i(p),false);}let inv=divide(scalar(1.),scalar(f32(n)));var sum=scalar(0.);for(var j=0u;j<n;j++){let t=multiply(subtract(divide(scalar(f32(j)),scalar(f32(n-1u))),scalar(.5)),coeff(4u));let x=add(scalar(f32(p.x)),multiply(coeff(0u),t));let y=add(scalar(f32(p.y)),multiply(coeff(2u),t));sum=add(sum,multiply(bilinear(x,y,paramU32(7u)!=0u),inv));}return rounded(sum);}`);
// Native small convolution bridge; only fixed presets are locally authored.
export const convolutionKernel=kernel('convolution-3x3',29,`
fn pixel(p:vec2u)->vec4f{let centre=input(vec2i(p),false);var sum=scalar(0.);for(var j=0u;j<9u;j++){let q=vec2i(p)+vec2i(i32(j%3u)-1,i32(j/3u)-1);sum=add(sum,multiply(pair(input(q,paramU32(28u)!=0u)),coeff(2u*j)));}var out=centre;for(var c=0u;c<3u;c++){var value=Pair(vec4f(sum.hi[c]),vec4f(sum.lo[c]));if(paramU32(27u)!=0u){let flat=rounded(sum);value=luma(flat,21u);}out[c]=rounded(add(value,multiply(scalar(paramF32(18u+c)),scalar(centre.a)))).x;}return out;}`);
export const morphologyKernel=kernel('morphology-image-step',4,`
fn pixel(p:vec2u)->vec4f{let axis=paramU32(1u);var d=vec2i(i32(paramU32(0u)),0);if(axis!=0u){d=d.yx;}let a=input(vec2i(p)-d,paramU32(3u)!=0u);let b=input(vec2i(p),false);let c=input(vec2i(p)+d,paramU32(3u)!=0u);if(!normal(a)||!normal(b)||!normal(c)){return bad();}if(paramU32(2u)!=0u){return max(max(a,b),c);}return min(min(a,b),c);}`);
export const posterizeKernel=kernel('posterize',2,`
fn pixel(p:vec2u)->vec4f{let v=input(vec2i(p),false);if(v.a==0.||paramF32(1u)==0.){return v;}let steps=paramF32(0u);var out=v;for(var c=0u;c<3u;c++){let value=divide(multiply(scalar(v[c]),scalar(steps)),scalar(v.a));var bin=floor_pair(add(absolute(value),scalar(.5)));if(greater(scalar(0.),value)){bin=-bin;}let mapped=multiply(divide(scalar(bin),scalar(steps)),scalar(v.a));out[c]=rounded(interpolate(scalar(v[c]),mapped,scalar(paramF32(1u)))).x;}return out;}`);
export const thresholdKernel=kernel('threshold',18,`
fn pixel(p:vec2u)->vec4f{let v=input(vec2i(p),false);if(v.a==0.||paramF32(9u)==0.){return v;}var out=v;for(var c=0u;c<3u;c++){var value=scalar(v[c]);if(paramU32(16u)==0u){value=luma(v,10u);}var on=!greater(multiply(scalar(paramF32(c)),scalar(v.a)),value);if(paramU32(17u)!=0u){on=!on;}let mapped=paramF32(select(3u+c,6u+c,on))*v.a;out[c]=rounded(interpolate(scalar(v[c]),scalar(mapped),scalar(paramF32(9u)))).x;}return out;}`);
// Hue-sector reconstruction follows EffectCraft's rgb/hsl sector shapes.
// Chroma scaling and lightness use a stated signed/HDR extension, avoiding the
// undefined HSL saturation denominator at L=0/1 for out-of-display RGB.
export const colourKernel=kernel('colour-foundations',32,`
fn vector(v:Pair,c:u32)->Pair{return Pair(vec4f(v.hi[c]),vec4f(v.lo[c]));}
fn set_component(v:ptr<function,Pair>,c:u32,value:Pair){(*v).hi[c]=value.hi.x;(*v).lo[c]=value.lo.x;}
fn hue_colour(v:vec4f,turns:f32,saturation:f32,lightness:f32)->Pair{
 let mx=max(max(v.r,v.g),v.b);let mn=min(min(v.r,v.g),v.b);let d=subtract(scalar(mx),scalar(mn));let l=multiply(add(scalar(mx),scalar(mn)),scalar(.5));var h=scalar(0.);
 if(mx!=mn){if(mx==v.r){h=divide(subtract(scalar(v.g),scalar(v.b)),d);}else if(mx==v.g){h=add(divide(subtract(scalar(v.b),scalar(v.r)),d),scalar(2.));}else{h=add(divide(subtract(scalar(v.r),scalar(v.g)),d),scalar(4.));}}
 h=add(h,scalar(turns*6.));let wrap=floor_pair(divide(h,scalar(6.)));h=subtract(h,scalar(wrap*6.));let sector=floor_pair(h);let t=subtract(h,scalar(sector));let c=multiply(d,add(scalar(1.),scalar(saturation)));var ll=l;if(lightness>=0.){ll=add(l,multiply(subtract(scalar(v.a),l),scalar(lightness)));}else{ll=multiply(l,scalar(1.+lightness));}let low=subtract(ll,multiply(c,scalar(.5)));var out=pair(v);let up=add(low,c);let rising=add(low,multiply(c,t));let falling=add(low,multiply(c,subtract(scalar(1.),t)));
 switch u32(max(sector,0.))%6u{case 0u:{set_component(&out,0u,up);set_component(&out,1u,rising);set_component(&out,2u,low);}case 1u:{set_component(&out,0u,falling);set_component(&out,1u,up);set_component(&out,2u,low);}case 2u:{set_component(&out,0u,low);set_component(&out,1u,up);set_component(&out,2u,rising);}case 3u:{set_component(&out,0u,low);set_component(&out,1u,falling);set_component(&out,2u,up);}case 4u:{set_component(&out,0u,rising);set_component(&out,1u,low);set_component(&out,2u,up);}default:{set_component(&out,0u,up);set_component(&out,1u,low);set_component(&out,2u,falling);}}return out;
}
fn selection(v:vec4f)->Pair{var distance=scalar(0.);for(var c=0u;c<3u;c++){let d=subtract(scalar(v[c]),multiply(scalar(paramF32(2u+c)),scalar(v.a)));distance=add(distance,multiply(d,d));}distance=root(distance);let a=multiply(scalar(paramF32(17u)),scalar(v.a));let b=multiply(scalar(paramF32(18u)),scalar(v.a));if(!greater(distance,a)){return scalar(1.);}if(!greater(add(a,b),distance)){return scalar(0.);}let t=divide(subtract(distance,a),b);return subtract(scalar(1.),multiply(multiply(t,t),subtract(scalar(3.),multiply(t,scalar(2.)))));}
fn power(v:Pair,alpha:f32,gamma:f32)->Pair{if(gamma==1.){return v;}let x=rounded(divide(v,scalar(alpha))).x;return scalar(sign(x)*pow(abs(x),1./gamma)*alpha);}
fn pixel(p:vec2u)->vec4f{
 let v=input(vec2i(p),false);let mode=paramU32(0u);var mapped=pair(v);let y=luma(v,11u);var amount=scalar(paramF32(1u));
 if(mode==5u){for(var c=0u;c<3u;c++){let x=add(multiply(scalar(v[c]),coeff(20u)),multiply(scalar(paramF32(5u+c)),scalar(v.a)));if(v.a==0.&&paramF32(8u+c)!=1.){set_component(&mapped,c,scalar(v[c]));}else{set_component(&mapped,c,power(x,select(v.a,1.,v.a==0.),paramF32(8u+c)));}}return vec4f(rounded(mapped).rgb,v.a);}
 if(v.a==0.){return v;}
 switch mode{
  case 0u:{if(paramF32(2u)==0.&&paramF32(3u)==0.&&paramF32(4u)==0.){return v;}mapped=hue_colour(v,paramF32(2u),paramF32(3u),paramF32(4u));}
  case 1u:{let gray=vec4f(vec3f(rounded(y).x),v.a);let hue=hue_colour(vec4f(v.a,0.,0.,v.a),paramF32(2u),0.,0.);let peak=maximum(absolute(y),scalar(0.));let chroma=multiply(peak,scalar(paramF32(3u)));let baseline=subtract(y,multiply(chroma,scalar(.5)));for(var c=0u;c<3u;c++){let unit=divide(vector(hue,c),scalar(v.a));set_component(&mapped,c,add(baseline,multiply(chroma,unit)));}let lift=multiply(scalar(paramF32(4u)),scalar(v.a));mapped=add(mapped,lift);}
  case 2u:{let mx=max(max(v.r,v.g),v.b);let mn=min(min(v.r,v.g),v.b);let scale=max(max(abs(v.r),abs(v.g)),abs(v.b));var sat=scalar(0.);if(scale>0.){sat=bounded(divide(subtract(scalar(mx),scalar(mn)),scalar(scale)),0.,1.);}let k=add(scalar(1.+paramF32(3u)),multiply(scalar(paramF32(2u)),subtract(scalar(1.),sat)));for(var c=0u;c<3u;c++){set_component(&mapped,c,add(y,multiply(subtract(scalar(v[c]),y),k)));}}
  case 3u:{for(var c=0u;c<3u;c++){set_component(&mapped,c,multiply(scalar(v[c]),scalar(paramF32(2u+c))));}if(paramU32(19u)!=0u){let yy=luma(rounded(mapped),11u);if(!greater(absolute(yy),scalar(0.))){if(greater(absolute(y),scalar(0.))){return bad();}}else{mapped=multiply(mapped,divide(y,yy));}}}
  case 4u:{for(var c=0u;c<3u;c++){let x=add(scalar(v[c]),multiply(scalar(paramF32(5u+c)),scalar(v.a)));set_component(&mapped,c,multiply(power(x,v.a,paramF32(2u+c)),scalar(paramF32(8u+c))));}}
  case 6u:{amount=multiply(amount,subtract(scalar(1.),selection(v)));for(var c=0u;c<3u;c++){set_component(&mapped,c,y);}}
  case 7u:{amount=multiply(amount,selection(v));mapped=hue_colour(v,paramF32(5u),paramF32(6u),paramF32(7u));}
  case 8u:{amount=multiply(amount,selection(v));for(var c=0u;c<3u;c++){set_component(&mapped,c,multiply(scalar(paramF32(5u+c)),scalar(v.a)));}}
  default:{return bad();}
 }
 return vec4f(rounded(interpolate(pair(v),mapped,amount)).rgb,v.a);
}`);
