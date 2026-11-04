/** Closed PA-1 float kernels. Split f64 constants, compensated f32 arithmetic,
 * and a single f32 store at each CPU-equivalent pass boundary. No user shader.
 * The owner preflights finite normal inputs / supported magnitude before upload.
 */
export const floatPassShader=`
struct Params {
 dims:vec4u,
 mode:vec4u,
 valuesHi:vec4f,
 valuesLo:vec4f,
 lumaHi:vec4f,
 lumaLo:vec4f,
 padding0:vec4f,
 padding1:vec4f,
}
@group(0) @binding(0) var<storage,read> source:array<vec4f>;
@group(0) @binding(1) var<storage,read> secondary:array<vec4f>;
@group(0) @binding(2) var<storage,read_write> destination:array<vec4f>;
@group(0) @binding(3) var<storage,read> weights:array<vec2f>;
@group(0) @binding(4) var<uniform> p:Params;

struct Pair { hi:vec4f, lo:vec4f }
fn pair(value:vec4f)->Pair { return Pair(value,vec4f(0.)); }
fn constant(hi:f32,lo:f32)->Pair { return Pair(vec4f(hi),vec4f(lo)); }
fn normalize(hi:vec4f,lo:vec4f)->Pair {
 let sum=hi+lo;
 let error=lo-(sum-hi);
 return Pair(sum,error);
}
fn add(a:Pair,b:Pair)->Pair {
 let sum=a.hi+b.hi;
 let virtualB=sum-a.hi;
 let error=(a.hi-(sum-virtualB))+(b.hi-virtualB);
 return normalize(sum,(error+a.lo)+b.lo);
}
fn negate(a:Pair)->Pair { return Pair(-a.hi,-a.lo); }
fn subtract(a:Pair,b:Pair)->Pair { return add(a,negate(b)); }
fn multiply(a:Pair,b:Pair)->Pair {
 let product=a.hi*b.hi;
 let error=fma(a.hi,b.hi,-product);
 let cross=(a.hi*b.lo+a.lo*b.hi)+a.lo*b.lo;
 return normalize(product,error+cross);
}
fn weighted(value:vec4f,weight:vec2f)->Pair {
 let product=value*weight.x;
 let error=fma(value,vec4f(weight.x),-product);
 return normalize(product,error+value*weight.y);
}
fn divide(a:Pair,b:Pair)->Pair {
 let first=a.hi/b.hi;
 let remainder=subtract(a,multiply(b,pair(first)));
 let second=(remainder.hi+remainder.lo)/b.hi;
 return normalize(first,second);
}
fn greater(a:Pair,b:Pair)->bool {
 return a.hi.x>b.hi.x || (a.hi.x==b.hi.x && a.lo.x>b.lo.x);
}
fn rounded(a:Pair)->vec4f { return a.hi+a.lo; }

fn gaussian(id:vec2u)->vec4f {
 var total=pair(vec4f(0.));
 for(var k=-i32(p.dims.z);k<=i32(p.dims.z);k++) {
  var x=i32(id.x);var y=i32(id.y);
  if(p.dims.w==0u){x+=k;}else{y+=k;}
  if(p.mode.x==1u){x=clamp(x,0,i32(p.dims.x)-1);y=clamp(y,0,i32(p.dims.y)-1);}
  else if(x<0||y<0||x>=i32(p.dims.x)||y>=i32(p.dims.y)){continue;}
  let sample=source[u32(y)*p.dims.x+u32(x)];
  total=add(total,weighted(sample,weights[u32(k+i32(p.dims.z))]));
 }
 return rounded(total);
}
fn threshold(index:u32)->vec4f {
 let value=source[index];
 if(value.a==0.){return vec4f(0.);}
 var luminance=weighted(vec4f(value.r),vec2f(p.lumaHi.r,p.lumaLo.r));
 luminance=add(luminance,weighted(vec4f(value.g),vec2f(p.lumaHi.g,p.lumaLo.g)));
 luminance=add(luminance,weighted(vec4f(value.b),vec2f(p.lumaHi.b,p.lumaLo.b)));
 let y=divide(luminance,pair(vec4f(value.a)));
 let limit=constant(p.valuesHi.x,p.valuesLo.x);
 if(!greater(y,limit)){return vec4f(0.);}
 let fraction=subtract(pair(vec4f(1.)),divide(limit,y));
 return rounded(multiply(pair(value),fraction));
}
fn combine(index:u32)->vec4f {
 let value=source[index];let bloom=secondary[index];
 let intensity=constant(p.valuesHi.y,p.valuesLo.y);
 let rgb=rounded(add(pair(value),multiply(pair(bloom),intensity)));
 var coverage=multiply(pair(vec4f(bloom.a)),intensity);
 let zero=pair(vec4f(0.));let one=pair(vec4f(1.));
 // This is PA-1 Glow's defined coverage saturation, never a Gaussian/RGB clamp.
 if(greater(zero,coverage)){coverage=zero;}
 if(greater(coverage,one)){coverage=one;}
 let alpha=rounded(add(pair(vec4f(value.a)),multiply(subtract(one,pair(vec4f(value.a))),coverage))).x;
 return vec4f(rgb.rgb,alpha);
}
@compute @workgroup_size(8,8) fn main(@builtin(global_invocation_id) id:vec3u) {
 if(id.x>=p.dims.x||id.y>=p.dims.y){return;}
 let index=id.y*p.dims.x+id.x;
 switch(p.mode.y) {
  case 0u:{destination[index]=gaussian(id.xy);}
  case 1u:{destination[index]=threshold(index);}
  case 2u:{destination[index]=combine(index);}
  default:{destination[index]=vec4f(bitcast<f32>(0x7fc00000u|p.mode.w));}
 }
}`;
