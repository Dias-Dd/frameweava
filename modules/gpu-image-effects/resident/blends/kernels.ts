import type {GpuPixelKernelSourceV1} from '../../../gpu-effects/pixel-types.ts';
import {arithmetic} from '../arithmetic.ts';
/** EffectCraft common.wgsl separable()/hard_light()/blend_pixel(), ec7ced1f MIT.
 * Mode IDs retained. Algebra is expressed in native PM, avoiding unassociation.
 * Upstream display clamps are replaced by an explicit signed/HDR extension. */
export const blendKernel:GpuPixelKernelSourceV1={abiVersion:1,id:'frameweave/blends/separable-pm',version:'1.0.0',inputCount:2,parameterWords:2,code:arithmetic+`
fn bad()->vec4f{return vec4f(bitcast<f32>(0x7fc00000u|(outputSize().x&1u)));}
fn scalar(v:f32)->Pair{return pair(vec4f(v));}
fn normal(v:vec4f)->bool{let b=bitcast<vec4u>(v)&vec4u(0x7fffffffu);return all((b==vec4u(0u))|(b>=vec4u(0x00800000u)));}
fn pm(v:vec4f,mode:u32)->vec4f{if(!normal(v)){return bad();}if(mode==1u){let c=v.rgb*v.a;if(!normal(vec4f(c,v.a))||(v.a>0.&&any((c==vec3f(0.))&(v.rgb!=vec3f(0.))))){return bad();}return vec4f(c,v.a);}return v;}
fn minimum(a:Pair,b:Pair)->Pair{if(greater(a,b)){return b;}return a;}
fn maximum(a:Pair,b:Pair)->Pair{if(greater(a,b)){return a;}return b;}
fn absolute(v:Pair)->Pair{if(greater(scalar(0.),v)){return negate(v);}return v;}
// Exact power-of-two branch boundary for normal covered Alpha. Tiny Alpha has
// no positive normal-F32 channel below its half; avoid FTZ at that boundary.
fn lower_half(c:f32,a:f32)->bool{if(c<=0.){return true;}if(c>=a||a<0x1p-125f){return false;}return c<=a*.5;}
fn pixel(p:vec2u)->vec4f{
 let raw=pm(read0(vec2i(p)),alpha0());let b=pm(read1(vec2i(p)),alpha1());let opacity=paramF32(1u);let s=raw*opacity;
 if(!normal(s)||(opacity>0.&&any((s==vec4f(0.))&(raw!=vec4f(0.))))){return bad();}
 let sa=scalar(s.a);let ba=scalar(b.a);let one=scalar(1.);let alpha=rounded(add(sa,multiply(ba,subtract(one,sa)))).x;var out=vec4f(0.,0.,0.,alpha);
 for(var c=0u;c<3u;c++){
  let cs=scalar(s[c]);let cb=scalar(b[c]);
  if(s.a==0.||b.a==0.){out[c]=rounded(add(cs,multiply(cb,subtract(one,sa)))).x;continue;}
  let P=multiply(cb,sa);let Q=multiply(cs,ba);let AB=multiply(sa,ba);let base=add(multiply(cs,subtract(one,ba)),multiply(cb,subtract(one,sa)));var overlap=scalar(0.);var result=scalar(0.);
  switch paramU32(0u){
   case 3u:{overlap=minimum(P,Q);result=add(base,overlap);}
   case 10u:{overlap=maximum(P,Q);result=add(base,overlap);}
   case 23u:{overlap=absolute(subtract(P,Q));result=add(base,overlap);}
   case 25u:{let product=multiply(cs,cb);result=add(subtract(cs,product),subtract(cb,product));}
   case 16u,18u:{var low=lower_half(b[c],b.a);if(paramU32(0u)==18u){low=lower_half(s[c],s.a);}if(low){let product=multiply(cs,cb);result=add(add(base,product),product);}else{let product=multiply(subtract(ba,cb),subtract(sa,cs));result=subtract(subtract(add(base,AB),product),product);}}
   case 7u:{result=subtract(add(cs,cb),AB);}
   case 26u:{result=add(cb,multiply(cs,subtract(one,multiply(ba,scalar(2.)))));}
   case 19u:{result=add(add(base,add(P,Q)),subtract(Q,AB));}
   case 21u:{if(lower_half(s[c],s.a)){overlap=minimum(P,multiply(Q,scalar(2.)));}else{overlap=maximum(P,subtract(multiply(Q,scalar(2.)),AB));}result=add(base,overlap);}
   default:{return bad();}
  }
  out[c]=rounded(result).x;
 }
 return out;
}`};
