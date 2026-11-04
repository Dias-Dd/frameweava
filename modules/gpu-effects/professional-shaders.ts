import {floatPassShader} from './float-pass-shaders.ts';

// Reuse the existing, qualified compensated operations verbatim. Only fixed SDK
// text enters this module; this is not a shader/source injection interface.
const begin=floatPassShader.indexOf('struct Pair {'),end=floatPassShader.indexOf('\nfn gaussian(');
if(begin<0||end<=begin)throw new Error('Closed float Pair shader source changed');
const pairMath=floatPassShader.slice(begin,end);

export const professionalShader=`
struct Params { dims:vec4u, mask:vec4u, sourceHigh:vec4f, sourceOffset:vec4f, sourceLow:vec4f, sourceOffsetLow:vec4f, maskHigh:vec4f, maskOffset:vec4f, maskLow:vec4f, maskOffsetLow:vec4f, values:vec4f }
@group(0) @binding(0) var<storage,read> source:array<vec4f>;
@group(0) @binding(1) var<storage,read> maskImage:array<vec4f>;
@group(0) @binding(2) var<storage,read_write> destination:array<vec4f>;
@group(0) @binding(3) var<uniform> p:Params;
${pairMath}
fn sourceAt(x:i32,y:i32)->vec4f {if(x<0||y<0||x>=i32(p.dims.x)||y>=i32(p.dims.y)){return vec4f(0);}return source[u32(y)*p.dims.x+u32(x)];}
fn maskAt(x:i32,y:i32)->f32 {if(x<0||y<0||x>=i32(p.mask.x)||y>=i32(p.mask.y)){return 0;}return maskImage[u32(y)*p.mask.x+u32(x)].a;}
struct Axis { cell:i32, fraction:Pair }
fn axis(a:f32,b:f32,c:f32,al:f32,bl:f32,cl:f32,xy:vec2f)->Axis {
 let v=add(add(multiply(constant(a,al),pair(vec4f(xy.x))),multiply(constant(b,bl),pair(vec4f(xy.y)))),constant(c,cl));
 var cell=floor(v.hi.x);var fraction=subtract(v,pair(vec4f(cell)));
 if(fraction.hi.x<0. || (fraction.hi.x==0. && fraction.lo.x<0.)){cell-=1.;fraction=add(fraction,pair(vec4f(1.)));}
 if(fraction.hi.x>1. || (fraction.hi.x==1. && fraction.lo.x>=0.)){cell+=1.;fraction=subtract(fraction,pair(vec4f(1.)));}
 return Axis(i32(cell),fraction);
}
fn sampleSource(xy:vec2f)->Pair {
 let x=axis(p.sourceHigh.x,p.sourceHigh.z,p.sourceOffset.x,p.sourceLow.x,p.sourceLow.z,p.sourceOffsetLow.x,xy);
 let y=axis(p.sourceHigh.y,p.sourceHigh.w,p.sourceOffset.y,p.sourceLow.y,p.sourceLow.w,p.sourceOffsetLow.y,xy);
 let one=pair(vec4f(1.));let ix=subtract(one,x.fraction);let iy=subtract(one,y.fraction);
 // compositor.ts sampler: form the XY weight first, then multiply the source,
 // accumulate 00,10,01,11, and retain it through opacity and blend.
 var total=multiply(pair(sourceAt(x.cell,y.cell)),multiply(ix,iy));
 total=add(total,multiply(pair(sourceAt(x.cell+1,y.cell)),multiply(x.fraction,iy)));
 total=add(total,multiply(pair(sourceAt(x.cell,y.cell+1)),multiply(ix,y.fraction)));
 return add(total,multiply(pair(sourceAt(x.cell+1,y.cell+1)),multiply(x.fraction,y.fraction)));
}
fn sampleMask(xy:vec2f)->Pair {
 let x=axis(p.maskHigh.x,p.maskHigh.z,p.maskOffset.x,p.maskLow.x,p.maskLow.z,p.maskOffsetLow.x,xy);
 let y=axis(p.maskHigh.y,p.maskHigh.w,p.maskOffset.y,p.maskLow.y,p.maskLow.w,p.maskOffsetLow.y,xy);
 let one=pair(vec4f(1.));let ix=subtract(one,x.fraction);let iy=subtract(one,y.fraction);
 // CPU maskSampler forms the XY weight first, then multiplies alpha.
 var total=multiply(pair(vec4f(maskAt(x.cell,y.cell))),multiply(ix,iy));
 total=add(total,multiply(pair(vec4f(maskAt(x.cell+1,y.cell))),multiply(x.fraction,iy)));
 total=add(total,multiply(pair(vec4f(maskAt(x.cell,y.cell+1))),multiply(ix,y.fraction)));
 return add(total,multiply(pair(vec4f(maskAt(x.cell+1,y.cell+1))),multiply(x.fraction,y.fraction)));
}
fn alphaOf(v:Pair)->Pair {return Pair(vec4f(v.hi.a),vec4f(v.lo.a));}
@compute @workgroup_size(8,8) fn main(@builtin(global_invocation_id) id:vec3u) {
 if(id.x>=p.dims.z||id.y>=p.dims.w){return;}let i=id.y*p.dims.z+id.x;let xy=vec2f(id.xy)+vec2f(.5);
 var original:Pair;if(p.values.w==1.){original=pair(source[i]);}else{original=sampleSource(xy);}
 var opacity=constant(p.values.z,p.values.x);if(p.mask.w==1u){opacity=multiply(opacity,sampleMask(xy));}
 let s=multiply(original,opacity);let b=pair(destination[i]);
 // CPU source-over to opaque zero RGB copies premultiplied RGB and has alpha1.
 // Do not unassociate, suppress hidden RGB or depend on tiny alpha arithmetic.
 if(p.mask.z==0u && all(b.hi.rgb==vec3f(0.)) && b.hi.a==1.){destination[i]=vec4f(rounded(s).rgb,1.);return;}
 let sa=alphaOf(s);let ba=alphaOf(b);let one=pair(vec4f(1.));
 let alpha=add(sa,multiply(ba,subtract(one,sa)));var rgb:Pair;
 if(p.mask.z==1u){let value=rounded(add(s,b));destination[i]=vec4f(value.rgb,min(1.,value.a));return;}
 if(p.mask.z==0u){rgb=add(s,multiply(b,subtract(one,sa)));}
 else {
  var cs=pair(vec4f(0.));var cb=pair(vec4f(0.));
  if(sa.hi.x!=0. || sa.lo.x!=0.){cs=divide(s,sa);}
  if(ba.hi.x!=0. || ba.lo.x!=0.){cb=divide(b,ba);}
  var blend:Pair;if(p.mask.z==2u){blend=multiply(cs,cb);}else{blend=subtract(add(cs,cb),multiply(cs,cb));}
  rgb=add(add(multiply(s,subtract(one,ba)),multiply(b,subtract(one,sa))),multiply(multiply(sa,ba),blend));
 }
 // One ordinary F32 publication per raster draw, including isolated targets.
 // Hidden RGB at alpha0 is retained; the CPU compositor does not canonicalize it.
 destination[i]=vec4f(rounded(rgb).rgb,rounded(alpha).x);
}
`;
