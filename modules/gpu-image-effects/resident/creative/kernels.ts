import type {GpuPixelKernelSourceV1} from '../../../gpu-effects/pixel-types.ts';
import {arithmetic} from '../arithmetic.ts';
// EffectCraft ec7ced1f, MIT. The scalar algorithms retain their upstream shapes;
// SDK helpers/uniforms and compensated PM algebra replace its texture framework.
const common=arithmetic+`
fn bad()->vec4f{return vec4f(bitcast<f32>(0x7fc00000u|(outputSize().x&1u)));}
fn scalar(v:f32)->Pair{return pair(vec4f(v));}
fn normal(v:vec4f)->bool{let b=bitcast<vec4u>(v)&vec4u(0x7fffffffu);return all((b==vec4u(0u))|(b>=vec4u(0x00800000u)));}
fn pm(v:vec4f,mode:u32)->vec4f{if(!normal(v)){return bad();}if(mode==1u){let rgb=v.rgb*v.a;if(!normal(vec4f(rgb,v.a))||(v.a>0.&&any((rgb==vec3f(0.))&(v.rgb!=vec3f(0.))))){return bad();}return vec4f(rgb,v.a);}return v;}
fn input(p:vec2i,clamped:bool)->vec4f{let q=select(p,clamp(p,vec2i(0),vec2i(size0())-1),clamped);return pm(read0(q),alpha0());}
fn luma(v:vec4f,base:u32)->Pair{var out=scalar(0.);for(var c=0u;c<3u;c++){out=add(out,weighted(vec4f(v[c]),vec2f(paramF32(base+2u*c),paramF32(base+2u*c+1u))));}return out;}
fn limited(v:Pair,hi:f32)->Pair{if(greater(scalar(0.),v)){return scalar(0.);}if(greater(v,scalar(hi))){return scalar(hi);}return v;}
fn interpolate(a:Pair,b:Pair,t:f32)->Pair{return add(a,multiply(subtract(b,a),scalar(t)));}
fn root(v:Pair)->Pair{if(!greater(v,scalar(0.))){return scalar(0.);}let x=sqrt(rounded(v).x);return add(scalar(x),divide(subtract(v,multiply(scalar(x),scalar(x))),scalar(2.*x)));}
`;
const kernel=(id:string,inputs:number,words:number,body:string):GpuPixelKernelSourceV1=>({abiVersion:1,id:'frameweave/creative/'+id,version:'1.0.0',inputCount:inputs,parameterWords:words,code:common+body});
// kernels.wgsl pointwise case 2, linear contrast branch; signed/HDR extension.
export const brightnessContrastKernel=kernel('brightness-contrast',1,3,`
fn pixel(p:vec2u)->vec4f{let v=input(vec2i(p),false);if(paramF32(0u)==0.&&paramF32(1u)==1.){return v;}let bias=multiply(subtract(scalar(paramF32(0u)),scalar(paramF32(2u))),scalar(v.a));let out=add(multiply(add(pair(v),bias),scalar(paramF32(1u))),multiply(scalar(paramF32(2u)),scalar(v.a)));return vec4f(rounded(out).rgb,v.a);}`);
// kernels.wgsl pointwise case 1; operate on PM luma without unassociation.
export const tintKernel=kernel('tint',1,14,`
fn pixel(p:vec2u)->vec4f{let v=input(vec2i(p),false);if(paramF32(6u)==0.){return v;}var y=luma(v,7u);if(paramU32(13u)!=0u){y=limited(y,v.a);}var out=v;for(var c=0u;c<3u;c++){let mapped=add(multiply(scalar(paramF32(c)),scalar(v.a)),multiply(subtract(scalar(paramF32(3u+c)),scalar(paramF32(c))),y));out[c]=rounded(interpolate(scalar(v[c]),mapped,paramF32(6u))).x;}return out;}`);
// fx_color.wgsl case 4, two linear Tritone segments. Extrapolation is explicit.
export const tritoneKernel=kernel('tritone',1,17,`
fn pixel(p:vec2u)->vec4f{let v=input(vec2i(p),false);if(v.a==0.||paramF32(9u)==0.){return v;}var y=luma(v,10u);if(paramU32(16u)!=0u){y=limited(y,v.a);}let high=!greater(scalar(v.a*.5),y);let b=select(0u,3u,high);var t=multiply(y,scalar(2.));if(high){t=subtract(t,scalar(v.a));}var out=v;for(var c=0u;c<3u;c++){let mapped=add(multiply(scalar(paramF32(b+c)),scalar(v.a)),multiply(subtract(scalar(paramF32(b+3u+c)),scalar(paramF32(b+c))),t));out[c]=rounded(interpolate(scalar(v[c]),mapped,paramF32(9u))).x;}return out;}`);
// fx_color.wgsl case 1. Tonal masks clamp, RGB does not.
export const colorBalanceKernel=kernel('color-balance',1,16,`
fn pixel(p:vec2u)->vec4f{let v=input(vec2i(p),false);let y=limited(luma(v,10u),v.a);let ws=limited(subtract(scalar(v.a),multiply(y,scalar(2.))),v.a);let wh=limited(subtract(multiply(y,scalar(2.)),scalar(v.a)),v.a);let wm=subtract(subtract(scalar(v.a),ws),wh);var delta=pair(vec4f(0.));
 for(var c=0u;c<3u;c++){let d=multiply(add(add(multiply(ws,scalar(paramF32(c))),multiply(wm,scalar(paramF32(3u+c)))),multiply(wh,scalar(paramF32(6u+c)))),scalar(.5));delta.hi[c]=d.hi.x;delta.lo[c]=d.lo.x;}
 if(paramU32(9u)!=0u){var dy=scalar(0.);var sum=scalar(0.);for(var c=0u;c<3u;c++){let w=constant(paramF32(10u+2u*c),paramF32(11u+2u*c));dy=add(dy,multiply(Pair(vec4f(delta.hi[c]),vec4f(delta.lo[c])),w));sum=add(sum,w);}let correction=divide(dy,sum);delta=subtract(delta,correction);}
 return vec4f(rounded(add(pair(v),delta)).rgb,v.a);}`);
// fx_color.wgsl case 3, six hue-sector controls; PM ratios preserve association.
export const blackAndWhiteKernel=kernel('black-and-white',1,7,`
fn pixel(p:vec2u)->vec4f{let v=input(vec2i(p),false);let mx=max(max(v.r,v.g),v.b);let mn=min(min(v.r,v.g),v.b);let d=subtract(scalar(mx),scalar(mn));var gray=scalar(mn);
 if(mx!=mn){var hue=scalar(0.);if(mx==v.r){hue=divide(subtract(scalar(v.g),scalar(v.b)),d);if(v.g<v.b){hue=add(hue,scalar(6.));}}else if(mx==v.g){hue=add(divide(subtract(scalar(v.b),scalar(v.r)),d),scalar(2.));}else{hue=add(divide(subtract(scalar(v.r),scalar(v.g)),d),scalar(4.));}
 var sector=floor(hue.hi.x);var t=subtract(hue,scalar(sector));if(greater(scalar(0.),t)){sector-=1.;t=add(t,scalar(1.));}if(!greater(scalar(1.),t)){sector+=1.;t=subtract(t,scalar(1.));}let i=u32(max(sector,0.))%6u;let weight=add(scalar(paramF32(i)),multiply(subtract(scalar(paramF32((i+1u)%6u)),scalar(paramF32(i))),t));gray=add(scalar(mn),multiply(d,weight));}
 let out=interpolate(pair(v),gray,paramF32(6u));return vec4f(rounded(out).rgb,v.a);}`);
// Verbatim EffectCraft common.wgsl hash_noise (MIT); no global/random state.
const noise=`
fn hash_noise(x:u32,y:u32,seed:u32)->f32{var h=(x*0x8da6b343u)^(y*0xd8163841u)^(seed*0xcb1ab31fu);h=h^(h>>13u);h=h*0x5bd1e995u;h=h^(h>>15u);return f32(h&0x00ffffffu)/16777216.;}
`;
export const filmGrainKernel=kernel('film-grain',1,4,noise+`
fn pixel(p:vec2u)->vec4f{let v=input(vec2i(p),false);var out=v;for(var c=0u;c<3u;c++){var seed=paramU32(1u)^(paramU32(2u)*0x85ebca6bu);if(paramU32(3u)!=0u){seed=seed^(c*0x9e3779b9u);}let n=subtract(add(scalar(hash_noise(p.x,p.y,seed)),scalar(hash_noise(p.x,p.y,seed^0x5bd1e995u))),scalar(1.));out[c]=rounded(add(scalar(v[c]),multiply(multiply(n,scalar(paramF32(0u))),scalar(v.a)))).x;}return out;}`);
// fx_stylize.wgsl CC Vignette, inverse-square falloff, optional highlight pin.
export const vignetteKernel=kernel('vignette',1,11,`
fn pixel(p:vec2u)->vec4f{let v=input(vec2i(p),false);let dims=vec2f(size0());let radius=multiply(scalar(paramF32(2u)),scalar(min(dims.x,dims.y)));let dx=divide(subtract(scalar(f32(p.x)+.5),multiply(scalar(paramF32(0u)),scalar(dims.x))),radius);let dy=divide(subtract(scalar(f32(p.y)+.5),multiply(scalar(paramF32(1u)),scalar(dims.y))),radius);let inv=divide(scalar(1.),add(scalar(1.),add(multiply(dx,dx),multiply(dy,dy))));let f=multiply(inv,inv);var gain=subtract(scalar(1.),multiply(scalar(paramF32(3u)),subtract(scalar(1.),f)));
 if(v.a>0.&&paramF32(4u)>0.){let pin=divide(limited(luma(v,5u),v.a),scalar(v.a));gain=add(gain,multiply(multiply(subtract(scalar(1.),gain),scalar(paramF32(4u))),pin));}return vec4f(rounded(multiply(pair(v),gain)).rgb,v.a);}`);
// fx_noise.wgsl fxn_smart_edges: same 3x3 Sobel stencil and 1/4 scaling;
// continuous magnitude/colour replaces its binary white threshold output.
export const sobelEdgesKernel=kernel('sobel-edges',1,12,`
fn pixel(p:vec2u)->vec4f{var l:array<Pair,9>;for(var y=0;y<3;y++){for(var x=0;x<3;x++){l[y*3+x]=luma(input(vec2i(p)+vec2i(x-1,y-1),paramU32(11u)!=0u),5u);}}let gx=subtract(add(add(l[2],multiply(l[5],scalar(2.))),l[8]),add(add(l[0],multiply(l[3],scalar(2.))),l[6]));let gy=subtract(add(add(l[6],multiply(l[7],scalar(2.))),l[8]),add(add(l[0],multiply(l[1],scalar(2.))),l[2]));let scale=max(abs(gx.hi.x),abs(gy.hi.x));var edge=scalar(0.);if(scale>0.){let x=divide(gx,scalar(scale));let y=divide(gy,scalar(scale));edge=multiply(root(add(multiply(x,x),multiply(y,y))),scalar(scale*.25));}let v=input(vec2i(p),false);edge=multiply(multiply(edge,scalar(paramF32(0u))),scalar(v.a));var out=v;for(var c=0u;c<3u;c++){let e=multiply(edge,scalar(paramF32(1u+c)));if(paramU32(4u)==0u){out[c]=rounded(add(scalar(v[c]),e)).x;}else{out[c]=rounded(e).x;}}return out;}`);
// fx_stylize.wgsl fxs_texturize: central height differences, directional light,
// nonnegative illumination, original radiance multiplied (no RGB clipping).
export const reliefLightingKernel=kernel('relief-lighting',2,11,`
fn height(q:vec2i)->Pair{var at=q;if(paramU32(9u)!=0u){at=clamp(q,vec2i(0),vec2i(size1())-1);}let v=pm(read1(at),alpha1());if(paramU32(10u)!=0u){return scalar(v.r);}return luma(v,3u);}
fn pixel(p:vec2u)->vec4f{let q=vec2i(p);let gx=multiply(subtract(height(q+vec2i(1,0)),height(q-vec2i(1,0))),scalar(.5));let gy=multiply(subtract(height(q+vec2i(0,1)),height(q-vec2i(0,1))),scalar(.5));let slope=add(multiply(gx,scalar(paramF32(1u))),multiply(gy,scalar(paramF32(2u))));var shade=subtract(scalar(1.),multiply(multiply(slope,scalar(paramF32(0u))),scalar(4.)));if(greater(scalar(0.),shade)){shade=scalar(0.);}let v=input(q,false);return vec4f(rounded(multiply(pair(v),shade)).rgb,v.a);}`);
// Native integer clipped-block centre sampling. No area-mean/Mosaic parity claim.
export const pixelateKernel=kernel('pixelate',1,4,`
fn floor_div(a:i32,b:i32)->i32{let q=a/b;if(a%b<0){return q-1;}return q;}
fn pixel(p:vec2u)->vec4f{let dims=vec2i(size0());let size=vec2i(i32(paramU32(0u)),i32(paramU32(1u)));let origin=vec2i(i32(paramU32(2u)),i32(paramU32(3u)));let block=vec2i(floor_div(i32(p.x)-origin.x,size.x),floor_div(i32(p.y)-origin.y,size.y));let lo=max(block*size+origin,vec2i(0));let hi=min(block*size+origin+size,dims);return input((lo+hi-1)/2,false);}`);
