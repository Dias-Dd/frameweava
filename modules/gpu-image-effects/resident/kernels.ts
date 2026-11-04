import type {GpuPixelKernelSourceV1} from '../../gpu-effects/pixel-types.ts';
import {arithmetic} from './arithmetic.ts';
const common=arithmetic+`
fn bad()->vec4f{return vec4f(bitcast<f32>(0x7fc00000u|(outputSize().x&1u)));}
fn normal3(v:vec3f)->bool{return all((abs(v)==vec3f(0.))|(abs(v)>=vec3f(0x1p-126f)))&&all(abs(v)<=vec3f(bitcast<f32>(0x7f7fffffu)));}
fn pm(v:vec4f,mode:u32)->vec4f{
 if(mode==1u){if(v.a!=0.&&v.a<0x1p-126f){return bad();}let rgb=v.rgb*v.a;if(!normal3(rgb)){return bad();}return vec4f(rgb,v.a);}
 if(!normal3(v.rgb)){return bad();}return v;
}
fn straight(v:vec4f)->vec3f{return rounded(divide(pair(vec4f(v.rgb,0.)),pair(vec4f(v.a)))).rgb;}
fn scalar(v:f32)->Pair{return pair(vec4f(v));}
fn smooth_pair(v:Pair,lo:f32,hi:f32)->Pair{
 let zero=scalar(0.);let one=scalar(1.);var t=divide(subtract(v,scalar(lo)),scalar(hi-lo));
 if(greater(zero,t)){return zero;}if(greater(t,one)){return one;}
 return multiply(multiply(t,t),subtract(scalar(3.),multiply(scalar(2.),t)));
}
fn metric_scale(v:f32)->f32{if(v==0.){return 1.;}return bitcast<f32>(bitcast<u32>(v)&0x7f800000u);}
fn luma(c:vec3f,base:u32)->Pair{
 return add(add(weighted(vec4f(c.r),vec2f(paramF32(base),0.)),weighted(vec4f(c.g),vec2f(paramF32(base+1u),0.))),weighted(vec4f(c.b),vec2f(paramF32(base+2u),0.)));
}
`;
const kernel=(id:string,inputs:number,words:number,body:string):GpuPixelKernelSourceV1=>({abiVersion:1,id:'frameweave/pro-colour/'+id,version:'1.0.0',inputCount:inputs,parameterWords:words,code:common+body});
export const copyPM=kernel('pm',1,0,`fn pixel(p:vec2u)->vec4f{return pm(read0(vec2i(p)),alpha0());}`);
export const channelMixKernel=kernel('channel-mix',1,12,`
fn pixel(p:vec2u)->vec4f{let v=pm(read0(vec2i(p)),alpha0());var out=v;
 for(var row=0u;row<3u;row++){var s=weighted(vec4f(v.r),vec2f(paramF32(row*3u),0.));s=add(s,weighted(vec4f(v.g),vec2f(paramF32(row*3u+1u),0.)));s=add(s,weighted(vec4f(v.b),vec2f(paramF32(row*3u+2u),0.)));s=add(s,weighted(vec4f(v.a),vec2f(paramF32(9u+row),0.)));out[row]=rounded(s).x;}return out;}`);
export const levelsKernel=kernel('levels',1,16,`
fn pixel(p:vec2u)->vec4f{let v=pm(read0(vec2i(p)),alpha0());var out=v;
 for(var c=0u;c<3u;c++){let gamma=paramF32(6u+c);if(v.a==0.&&gamma!=1.){continue;}
 var t=divide(subtract(scalar(v[c]),multiply(scalar(paramF32(c)),scalar(v.a))),subtract(scalar(paramF32(3u+c)),scalar(paramF32(c))));
 if(paramU32(15u)!=0u){if(greater(scalar(0.),t)){t=scalar(0.);}if(greater(t,scalar(v.a))){t=scalar(v.a);}}
 if(gamma!=1.){if(v.a!=0.&&v.a<0x1p-126f){return bad();}let x=rounded(divide(t,scalar(v.a))).x;let curved=sign(x)*pow(abs(x),1./gamma);t=multiply(scalar(curved),scalar(v.a));}
 out[c]=rounded(add(multiply(t,subtract(scalar(paramF32(12u+c)),scalar(paramF32(9u+c)))),multiply(scalar(paramF32(9u+c)),scalar(v.a)))).x;
 }return out;}`);
/** Adapted EffectCraft curve_exact, pinned ec7ced1f, MIT; param-word ABI and
 * compensated endpoint extrapolation replace its framework storage bindings. */
export const curvesKernel=kernel('curves',1,296,`
fn curve(base:u32,x:f32)->f32{
 let n=u32(paramF32(base));let xs=base+1u;let ys=xs+n;let ms=ys+n;
 if(x<=paramF32(xs)){return rounded(add(scalar(paramF32(ys)),multiply(subtract(scalar(x),scalar(paramF32(xs))),scalar(paramF32(ms))))).x;}
 if(x>=paramF32(xs+n-1u)){return rounded(add(scalar(paramF32(ys+n-1u)),multiply(subtract(scalar(x),scalar(paramF32(xs+n-1u))),scalar(paramF32(ms+n-1u))))).x;}
 var k=0u;for(var i=0u;i<n;i++){if(paramF32(xs+i)<=x){k=i+1u;}}k=min(max(k,1u)-1u,n-2u);
 let h=paramF32(xs+k+1u)-paramF32(xs+k);let t=(x-paramF32(xs+k))/h;let t2=t*t;let t3=t2*t;
 var s=weighted(vec4f(paramF32(ys+k)),vec2f(2.*t3-3.*t2+1.,0.));s=add(s,weighted(vec4f(h*paramF32(ms+k)),vec2f(t3-2.*t2+t,0.)));s=add(s,weighted(vec4f(paramF32(ys+k+1u)),vec2f(-2.*t3+3.*t2,0.)));s=add(s,weighted(vec4f(h*paramF32(ms+k+1u)),vec2f(t3-t2,0.)));return rounded(s).x;
}
fn pixel(p:vec2u)->vec4f{let v=pm(read0(vec2i(p)),alpha0());if(v.a==0.){return v;}if(v.a<0x1p-126f){return bad();}let c=straight(v);var out=v;for(var i=0u;i<3u;i++){out[i]=rounded(multiply(scalar(curve(u32(paramF32(i)),c[i])),scalar(v.a))).x;}return out;}`);
export const lumaKeyKernel=kernel('luma-key',1,6,`
fn pixel(p:vec2u)->vec4f{let v=pm(read0(vec2i(p)),alpha0());if(v.a==0.){return v;}if(v.a<0x1p-126f){return bad();}let c=straight(v);let scale=metric_scale(max(max(max(abs(c.r),abs(c.g)),abs(c.b)),max(abs(paramF32(0u)),abs(paramF32(1u)))));let lo=paramF32(0u)/scale;let hi=paramF32(1u)/scale;if(!(hi>lo)){return bad();}var k=smooth_pair(luma(c/scale,2u),lo,hi);if(paramU32(5u)!=0u){k=subtract(scalar(1.),k);}return rounded(multiply(pair(v),k));}`);
export const chromaKeyKernel=kernel('chroma-key',1,9,`
fn pixel(p:vec2u)->vec4f{let v=pm(read0(vec2i(p)),alpha0());if(v.a==0.){return v;}if(v.a<0x1p-126f){return bad();}let c=straight(v);let key=vec3f(paramF32(0u),paramF32(1u),paramF32(2u));let scale=metric_scale(max(max(max(max(abs(c.r),abs(c.g)),abs(c.b)),max(max(abs(key.r),abs(key.g)),abs(key.b))),paramF32(4u)));let delta=(c/scale)-(key/scale);let dy=luma(delta,5u);let cb=subtract(scalar(delta.b),dy);let cr=subtract(scalar(delta.r),dy);let d2=add(multiply(cb,cb),multiply(cr,cr));var d=scalar(0.);
 if(greater(d2,scalar(0.))){let r=sqrt(rounded(d2).x);d=add(scalar(r),divide(subtract(d2,multiply(scalar(r),scalar(r))),scalar(2.*r)));}
 let lo=paramF32(3u)/scale;let hi=paramF32(4u)/scale;if(!(hi>lo)){return bad();}var k=smooth_pair(d,lo,hi);if(paramU32(8u)!=0u){k=subtract(scalar(1.),k);}return rounded(multiply(pair(v),k));}`);
/** EffectCraft basic spill subtraction; Alpha-homogeneous PM form avoids division. */
export const despillKernel=kernel('despill',1,3,`
fn pixel(p:vec2u)->vec4f{var v=pm(read0(vec2i(p)),alpha0());let selected=paramU32(0u);let a=(selected+1u)%3u;let b=(selected+2u)%3u;var limit=max(v[a],v[b]);if(paramU32(2u)!=0u){limit=rounded(multiply(add(scalar(v[a]),scalar(v[b])),scalar(.5))).x;}if(v[selected]>limit){v[selected]=rounded(subtract(scalar(v[selected]),multiply(subtract(scalar(v[selected]),scalar(limit)),scalar(paramF32(1u))))).x;}return v;}`);
export const blurPrepare=kernel('unsharp-prepare',1,0,`
fn pixel(p:vec2u)->vec4f{let v=pm(read0(vec2i(p)),alpha0());if(v.a==0.){return vec4f(0.);}return v;}`);
export const gaussianAxis=kernel('raw-gaussian-axis',1,774,`
fn pixel(p:vec2u)->vec4f{var total=pair(vec4f(0.));let r=i32(paramU32(0u));let d=vec2i(size0());for(var k=-r;k<=r;k++){var q=vec2i(p);if(paramU32(1u)==0u){q.x+=k;}else{q.y+=k;}if(paramU32(2u)!=0u){q=clamp(q,vec2i(0),d-1);}else if(any(q<vec2i(0))||any(q>=d)){continue;}let i=4u+2u*u32(k+r);total=add(total,weighted(read0(q),vec2f(paramF32(i),paramF32(i+1u))));}return rounded(total);}`);
export const unsharpKernel=kernel('unsharp',2,1,`
fn pixel(p:vec2u)->vec4f{let v=pm(read0(vec2i(p)),alpha0());if(v.a==0.){return v;}let b=read1(vec2i(p));if(b.a<=0.||b.a<0x1p-126f){return bad();}let normalized=multiply(pair(b),divide(scalar(v.a),scalar(b.a)));let out=rounded(add(pair(v),multiply(subtract(pair(v),normalized),scalar(paramF32(0u)))));return vec4f(out.rgb,v.a);}`);
