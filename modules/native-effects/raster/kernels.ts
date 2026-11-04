import {pixelCompensatedArithmetic as math} from '../../gpu-effects/pixel-effects.ts';
import {professionalShader} from '../../gpu-effects/professional-shaders.ts';
import type {GpuPixelKernelSourceV1} from '../../gpu-effects/pixel-types.ts';
const kernel=(id:string,inputCount:number,parameterWords:number,code:string):GpuPixelKernelSourceV1=>({abiVersion:1,id:'frameweave/native-raster-'+id,version:'1.0.0',inputCount,parameterWords,code});
const header=math+`
fn scalar(i:u32)->Pair{return constant(paramF32(i),paramF32(i+1u));}
fn alphaOf(v:Pair)->Pair{return Pair(vec4f(v.hi.a),vec4f(v.lo.a));}
`;
/** Explicit association/canonicalisation publication. Cross-colour conversion
 * needs an admitted owner primitive and is refused by the adapter. */
export const prepareKernel=kernel('prepare',1,2,header+`
fn pixel(p:vec2u)->vec4f{
 var v=read0(vec2i(p));let a=v.a;
 if(paramU32(1u)!=0u&&a==0.){v=vec4f(0.);}
 let associationMode=paramU32(0u);
 if(associationMode==1u&&alpha0()!=0u){v=vec4f(rounded(multiply(pair(v),pair(vec4f(a)))).rgb,a);}
 if(associationMode==2u&&alpha0()==0u){if(a==0.){v=vec4f(0.);}else{v=vec4f(rounded(divide(pair(v),pair(vec4f(a)))).rgb,a);}}
 return v;
}`);
export const unaryKernel=kernel('unary',1,8,header+`
fn pixel(p:vec2u)->vec4f{let v=read0(vec2i(p));let op=paramU32(0u);
 if(op==0u){return vec4f(rounded(multiply(pair(v),pair(vec4f(paramF32(1u))))).rgb,v.a);}
 let coverage=select(1.,v.a,alpha0()==0u);
 if(op==1u){return vec4f(rounded(subtract(pair(vec4f(coverage)),pair(v))).rgb,v.a);}
 if(op==2u){let offset=vec4f(paramF32(1u),paramF32(2u),paramF32(3u),0.);return vec4f(rounded(add(pair(v),multiply(pair(offset),pair(vec4f(coverage))))).rgb,v.a);}
 if(op==3u){return vec4f(v.rgb,1.);}
 if(op==4u){return vec4f(0.,0.,0.,rounded(subtract(pair(vec4f(1.)),pair(vec4f(v.a)))).x);}
 return v;
}`);
export const binaryKernel=kernel('binary',2,4,header+`
fn pixel(p:vec2u)->vec4f{let a=read0(vec2i(p));let b=read1(vec2i(p));let op=paramU32(0u);
 if(op==0u){let v=rounded(add(pair(a),pair(b)));return vec4f(v.rgb,min(1.,v.a));}
 if(op==1u){return vec4f(rounded(multiply(pair(a),pair(b))).rgb,a.a);}
 if(op==2u){let m=scalar(1u);return rounded(add(multiply(pair(a),subtract(pair(vec4f(1.)),m)),multiply(pair(b),m)));}
 if(op==3u){return vec4f(0.,0.,0.,rounded(multiply(pair(vec4f(a.a)),subtract(pair(vec4f(1.)),pair(vec4f(b.a))))).x);}
 if(op==4u){return vec4f(0.,0.,0.,rounded(add(pair(vec4f(b.a)),multiply(pair(vec4f(a.a)),subtract(pair(vec4f(1.)),pair(vec4f(b.a)))))).x);}
 // Replace coverage: first input has already recovered straight colour.
 return vec4f(rounded(multiply(pair(a),pair(vec4f(select(b.a,1.,paramU32(3u)==1u))))).rgb,b.a);
}`);
// Copy the shipped compositor's arithmetic verbatim, replacing only its resource
// access and destination write. No new blend approximation or backend exists.
const begin=professionalShader.indexOf(' // CPU source-over to opaque'),end=professionalShader.lastIndexOf('\n}');
if(begin<0||end<=begin)throw Error('Professional compositor body changed');
export const blendKernel=kernel('blend',2,4,header+`
fn pixel(p:vec2u)->vec4f{let opacity=scalar(1u);let s=multiply(pair(read0(vec2i(p))),opacity);let b=pair(read1(vec2i(p)));let mode=paramU32(0u);
`+professionalShader.slice(begin,end).replaceAll('p.mask.z','mode').replaceAll('destination[i]=','return ').replaceAll(';return;',';')+`\n}`);
export const matteKernel=kernel('matte',2,8,header+`
fn pixel(p:vec2u)->vec4f{let source=read0(vec2i(p));let mask=read1(vec2i(p));let opacity=scalar(4u);let a=multiply(pair(vec4f(mask.a)),opacity);
 let op=paramU32(0u);var value:vec4f;
 if(op==0u){value=rounded(multiply(pair(source),a));}
 else{value=vec4f(rounded(multiply(pair(vec4f(paramF32(1u),paramF32(2u),paramF32(3u),1.)),a)).rgb,rounded(a).x);}
 if(op==2u){return vec4f(value.rgb,1.);}return value;
}`);
export const alphaKernel=kernel('alpha-pad',1,4,`
fn pixel(p:vec2u)->vec4f{let q=vec2i(p)-vec2i(i32(paramU32(0u)),i32(paramU32(1u)));return vec4f(0.,0.,0.,read0(q).a);}`);
export const reframeKernel=kernel('reframe',1,6,`
fn pixel(p:vec2u)->vec4f{var q=p;if(paramU32(2u)!=0u){q.x=outputSize().x-1u-q.x;}if(paramU32(3u)!=0u){q.y=outputSize().y-1u-q.y;}
 if(paramU32(4u)!=0u){return vec4f(0.);}return read0(vec2i(q)+vec2i(bitcast<i32>(paramU32(0u)),bitcast<i32>(paramU32(1u))));}`);
export const tileKernel=kernel('tile',1,4,`
fn pixel(p:vec2u)->vec4f{let d=size0();let mirror=paramU32(2u)!=0u;let period=d*select(1u,2u,mirror);var q=(p%period+vec2u(paramU32(0u),paramU32(1u)))%period;
 if(mirror){q=select(q,period-1u-q,q>=d);}return read0(vec2i(q));}`);
export const shadowKernel=kernel('shadow',1,12,header+`
fn pixel(p:vec2u)->vec4f{if(paramU32(10u)!=0u){return vec4f(0.);}
 let x=subtract(pair(vec4f(f32(p.x)+paramF32(9u))),scalar(5u));let y=subtract(pair(vec4f(f32(p.y)+paramF32(9u))),scalar(7u));
 var ix=floor(x.hi.x);var fx=subtract(x,pair(vec4f(ix)));if(fx.hi.x<0.||(fx.hi.x==0.&&fx.lo.x<0.)){ix-=1.;fx=add(fx,pair(vec4f(1.)));}
 var iy=floor(y.hi.x);var fy=subtract(y,pair(vec4f(iy)));if(fy.hi.x<0.||(fy.hi.x==0.&&fy.lo.x<0.)){iy-=1.;fy=add(fy,pair(vec4f(1.)));}
 let one=pair(vec4f(1.));let a=subtract(one,fx);let b=subtract(one,fy);let q=vec2i(i32(ix),i32(iy));
 var mask=multiply(pair(vec4f(read0(q).a)),multiply(a,b));
 mask=add(mask,multiply(pair(vec4f(read0(q+vec2i(1,0)).a)),multiply(fx,b)));
 mask=add(mask,multiply(pair(vec4f(read0(q+vec2i(0,1)).a)),multiply(a,fy)));
 mask=add(mask,multiply(pair(vec4f(read0(q+vec2i(1)).a)),multiply(fx,fy)));
 let opacity=multiply(scalar(3u),mask);return rounded(multiply(pair(vec4f(paramF32(0u),paramF32(1u),paramF32(2u),1.)),opacity));
}`);
