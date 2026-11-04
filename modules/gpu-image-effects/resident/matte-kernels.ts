import type {GpuPixelKernelSourceV1} from '../../gpu-effects/pixel-types.ts';
import {arithmetic} from './arithmetic.ts';
const common=arithmetic+`
fn bad()->vec4f{return vec4f(bitcast<f32>(0x7fc00000u|(outputSize().x&1u)));}
fn scalar(v:f32)->Pair{return pair(vec4f(v));}
fn mask(a:f32)->vec4f{return vec4f(0.,0.,0.,a);}
fn normal_alpha(a:f32)->bool{let b=bitcast<u32>(a)&0x7fffffffu;return b==0u||b>=0x00800000u;}
fn normal_rgb(v:vec3f)->bool{let b=bitcast<vec3u>(v)&vec3u(0x7fffffffu);return all((b==vec3u(0u))|(b>=vec3u(0x00800000u)));}
`;
const kernel=(id:string,inputCount:number,parameterWords:number,code:string):GpuPixelKernelSourceV1=>({abiVersion:1,id:'frameweave/pro-matte/'+id,version:'1.0.0',inputCount,parameterWords,code:common+code});
export const extractMask=kernel('extract',1,0,`fn pixel(p:vec2u)->vec4f{let a=read0(vec2i(p)).a;if(!normal_alpha(a)){return bad();}return mask(a);}`);
/** EffectCraft fxc_morph min/max/axis semantics, using three shifted intervals.
 * Host composes contiguous windows; no per-pixel loop proportional to radius. */
export const morphStep=kernel('morph-step',1,4,`
fn coverage(p:vec2i)->f32{let d=vec2i(size0());if(paramU32(3u)!=0u){return read0(clamp(p,vec2i(0),d-1)).a;}return read0(p).a;}
fn pixel(p:vec2u)->vec4f{let at=vec2i(p);var delta=vec2i(i32(paramU32(0u)),0);if(paramU32(1u)!=0u){delta=delta.yx;}
 let a=coverage(at-delta);let b=coverage(at);let c=coverage(at+delta);if(paramU32(2u)!=0u){return mask(max(max(a,b),c));}return mask(min(min(a,b),c));}`);
/** Full two-dimensional integer results are blended, not independent fractional
 * axis filters (EffectCraft util::morph_frac / fxc_lerp). No 1e-4 snap. */
export const mixMask=kernel('fractional-radius',2,1,`
fn pixel(p:vec2u)->vec4f{let a=read0(vec2i(p)).a;let b=read1(vec2i(p)).a;let t=paramF32(0u);let v=rounded(add(scalar(a),multiply(subtract(scalar(b),scalar(a)),scalar(t)))).x;
 if(!normal_alpha(v)||(v==0.&&((a>0.&&t<1.)||(b>0.&&t>0.)))){return bad();}return mask(clamp(v,0.,1.));}`);
/** EffectCraft Matte Choker's normalized threshold ramp, with explicit endpoints
 * and optional gamma. Alpha is deliberately clamped; RGB is never clipped. */
export const levelsMask=kernel('levels',1,4,`
fn pixel(p:vec2u)->vec4f{let a=read0(vec2i(p)).a;if(!normal_alpha(a)){return bad();}let lo=paramF32(0u);let hi=paramF32(1u);var v=0.;
 if(a>=hi){v=1.;}else if(a>lo){let x=rounded(divide(subtract(scalar(a),scalar(lo)),subtract(scalar(hi),scalar(lo)))).x;v=x;if(paramF32(2u)!=1.){v=pow(x,1./paramF32(2u));}if(v==0.||!normal_alpha(v)){return bad();}}
 if(paramU32(3u)!=0u){v=rounded(subtract(scalar(1.),scalar(v))).x;}return mask(clamp(v,0.,1.));}`);
export const multiplyMask=kernel('apply',2,0,`
fn pixel(p:vec2u)->vec4f{let v=read0(vec2i(p));let a=read1(vec2i(p)).a;if(!normal_alpha(v.a)||!normal_alpha(a)||!normal_rgb(v.rgb)){return bad();}var rgb=v.rgb;
 if(alpha0()==1u){rgb=rgb*v.a;if(!normal_rgb(rgb)||(any((rgb==vec3f(0.))&(v.rgb!=vec3f(0.)))&&v.a>0.)){return bad();}}
 let out=rounded(multiply(pair(vec4f(rgb,v.a)),scalar(a)));if(!normal_alpha(out.a)||!normal_rgb(out.rgb)||(a>0.&&((out.a==0.&&v.a>0.)||any((out.rgb==vec3f(0.))&(rgb!=vec3f(0.)))))){return bad();}return out;}`);
