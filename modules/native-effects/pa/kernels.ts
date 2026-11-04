import {pixelCompensatedArithmetic as math} from '../../gpu-effects/pixel-effects.ts';
import {floatPassShader} from '../../gpu-effects/float-pass-shaders.ts';
import type {GpuPixelKernelSourceV1,GpuPixelKernelSourceV2} from '../../gpu-effects/pixel-types.ts';
const k=(id:string,inputCount:number,parameterWords:number,code:string):GpuPixelKernelSourceV1=>({abiVersion:1,id:'frameweave/native-pa-'+id,version:'1.0.0',inputCount,parameterWords,code});
const head=math+`fn scalar(i:u32)->Pair{return constant(paramF32(i),paramF32(i+1u));}`;
export const canonical=k('canonical',1,0,`fn pixel(p:vec2u)->vec4f{let v=read0(vec2i(p));return vec4f(select(select(v.rgb*v.a,v.rgb,alpha0()==0u),vec3f(0.),v.a==0.),v.a);}`);
// Existing PA-1 Gaussian function with only resource/parameter access adapted.
const begin=floatPassShader.indexOf('fn gaussian('),end=floatPassShader.indexOf('\nfn threshold(');
if(begin<0||end<=begin)throw Error('Original PA Gaussian source changed');
const gaussianBody=floatPassShader.slice(begin,end).replaceAll('p.dims.z','paramU32(0u)').replaceAll('p.dims.w','paramU32(1u)').replaceAll('p.dims.x','size0().x').replaceAll('p.dims.y','size0().y').replaceAll('p.mode.x','paramU32(2u)').replaceAll('source[u32(y)*size0().x+u32(x)]','read0(vec2i(x,y))').replaceAll('weights[u32(k+i32(paramU32(0u)))]','vec2f(paramF32(4u+2u*u32(k+i32(paramU32(0u)))),paramF32(5u+2u*u32(k+i32(paramU32(0u)))))');
export const gaussian=k('gaussian',1,774,guardedMath(3,head+gaussianBody+'\nfn pixel(p:vec2u)->vec4f{return gaussian(p);}'));
export const threshold=k('threshold',1,9,guardedMath(8,head+`
fn pixel(p:vec2u)->vec4f{let v=read0(vec2i(p));if(v.a==0.){return vec4f(0.);}
 var y=weighted(vec4f(v.r),vec2f(paramF32(2u),paramF32(3u)));y=add(y,weighted(vec4f(v.g),vec2f(paramF32(4u),paramF32(5u))));y=add(y,weighted(vec4f(v.b),vec2f(paramF32(6u),paramF32(7u))));y=divide(y,pair(vec4f(v.a)));
 if(!greater(y,scalar(0u))){return vec4f(0.);}return rounded(multiply(pair(v),subtract(pair(vec4f(1.)),divide(scalar(0u),y))));}`));
export const combine=k('combine',2,3,guardedMath(2,head+`
fn pixel(p:vec2u)->vec4f{let source=read0(vec2i(p));let bloom=read1(vec2i(p));let intensity=scalar(0u);let rgb=rounded(add(pair(source),multiply(pair(bloom),intensity)));var coverage=multiply(pair(vec4f(bloom.a)),intensity);let zero=pair(vec4f(0.));let one=pair(vec4f(1.));if(greater(zero,coverage)){coverage=zero;}if(greater(coverage,one)){coverage=one;}let a=rounded(add(pair(vec4f(source.a)),multiply(subtract(one,pair(vec4f(source.a))),coverage))).x;return vec4f(rgb.rgb,a);}`));
/** PA-1's F64 coordinate and 00/10/01/11 weight/product order. Pixel centres
 * stay integer; nearest is floor(x+.5), including negative half coordinates. */
const sampler=head+`
struct Coord{cell:vec2i,fx:Pair,fy:Pair}
fn coordinates(x:Pair,y:Pair)->Coord{var ix=floor(x.hi.x);var fx=subtract(x,pair(vec4f(ix)));if(fx.hi.x<0.||(fx.hi.x==0.&&fx.lo.x<0.)){ix-=1.;fx=add(fx,pair(vec4f(1.)));}if(fx.hi.x>1.||(fx.hi.x==1.&&fx.lo.x>=0.)){ix+=1.;fx=subtract(fx,pair(vec4f(1.)));}
 var iy=floor(y.hi.x);var fy=subtract(y,pair(vec4f(iy)));if(fy.hi.x<0.||(fy.hi.x==0.&&fy.lo.x<0.)){iy-=1.;fy=add(fy,pair(vec4f(1.)));}if(fy.hi.x>1.||(fy.hi.x==1.&&fy.lo.x>=0.)){iy+=1.;fy=subtract(fy,pair(vec4f(1.)));}return Coord(vec2i(i32(ix),i32(iy)),fx,fy);}
fn at(q:vec2i)->vec4f{var xy=q;if(paramU32(0u)!=0u){xy=clamp(xy,vec2i(0),vec2i(size0())-1);}return read0(xy);}
fn bilinearPair(x:Pair,y:Pair)->Pair{let c=coordinates(x,y);let one=pair(vec4f(1.));let ix=subtract(one,c.fx);let iy=subtract(one,c.fy);
 // Original CPU: (((s00*ix)*iy+(s10*fx)*iy)+(s01*ix)*fy)+(s11*fx)*fy.
 var result=multiply(multiply(pair(at(c.cell)),ix),iy);result=add(result,multiply(multiply(pair(at(c.cell+vec2i(1,0))),c.fx),iy));result=add(result,multiply(multiply(pair(at(c.cell+vec2i(0,1))),ix),c.fy));return add(result,multiply(multiply(pair(at(c.cell+vec2i(1))),c.fx),c.fy));}
fn bilinear(x:Pair,y:Pair)->vec4f{return rounded(bilinearPair(x,y));}
`;
/** The driver may algebraically erase compensated residuals across ordinary
 * f32 lets. A runtime-zero integer XOR makes the original f32 rounding points
 * observable without a store/pass, f64 shader feature or owner modification. */
function guardedMath(word:number,body:string){return `fn round32(v:vec4f)->vec4f{return bitcast<vec4f>(bitcast<vec4u>(v)^vec4u(paramU32(${word}u)));}\n`+body
 .replace('let sum=hi+lo;','let sum=round32(hi+lo);').replace('let error=lo-(sum-hi);','let error=round32(lo-round32(sum-hi));')
 .replace('let sum=a.hi+b.hi;','let sum=round32(a.hi+b.hi);').replace('let virtualB=sum-a.hi;','let virtualB=round32(sum-a.hi);').replace('let error=(a.hi-(sum-virtualB))+(b.hi-virtualB);','let error=round32(round32(a.hi-round32(sum-virtualB))+round32(b.hi-virtualB));').replace('return normalize(sum,(error+a.lo)+b.lo);','return normalize(sum,round32(round32(error+a.lo)+b.lo));')
 .replace('let product=a.hi*b.hi;','let product=round32(a.hi*b.hi);').replace('let error=fma(a.hi,b.hi,-product);','let error=round32(fma(a.hi,b.hi,-product));').replace('let cross=(a.hi*b.lo+a.lo*b.hi)+a.lo*b.lo;','let cross=round32(round32(round32(a.hi*b.lo)+round32(a.lo*b.hi))+round32(a.lo*b.lo));').replace('return normalize(product,error+cross);','return normalize(product,round32(error+cross));')
 .replace('let product=value*weight.x;','let product=round32(value*weight.x);').replace('let error=fma(value,vec4f(weight.x),-product);','let error=round32(fma(value,vec4f(weight.x),-product));').replace('return normalize(product,error+value*weight.y);','return normalize(product,round32(error+round32(value*weight.y)));');}
const guardedSampler=(word:number)=>guardedMath(word,sampler);
export const displacement:GpuPixelKernelSourceV2={...k('sine-displacement',1,9,guardedSampler(8)+`
fn pixel(p:vec2u)->vec4f{let wx=constant(data0(2u*p.x),data0(2u*p.x+1u));let wy=constant(data0(2u*(size0().x+p.y)),data0(2u*(size0().x+p.y)+1u));let amount=scalar(2u);
 let x=add(add(pair(vec4f(f32(p.x))),multiply(multiply(amount,wy),wx)),scalar(4u));let y=add(add(pair(vec4f(f32(p.y))),multiply(multiply(amount,wx),constant(0.6, -0.00000002384185793236071))),scalar(6u));
 if(paramU32(1u)!=0u){let c=coordinates(add(x,constant(.5,0.)),add(y,constant(.5,0.)));return at(c.cell);}return bilinear(x,y);}`),abiVersion:2,dataInputs:[{type:'f32'}]};
export const mapWarp=k('rg-map',2,4,guardedSampler(1)+`
fn pixel(p:vec2u)->vec4f{let map=read1(vec2i(p));let scale=scalar(2u);return bilinear(add(pair(vec4f(f32(p.x))),multiply(pair(vec4f(map.r)),scale)),add(pair(vec4f(f32(p.y))),multiply(pair(vec4f(map.g)),scale)));}`);
export const inversePad=k('inverse-pad',1,4,guardedMath(3,math+`
fn pixel(p:vec2u)->vec4f{var a=0.;if(paramU32(2u)==0u){let q=vec2i(p)+vec2i(bitcast<i32>(paramU32(0u)),bitcast<i32>(paramU32(1u)));a=read0(q).a;}return vec4f(0.,0.,0.,rounded(subtract(pair(vec4f(1.)),pair(vec4f(a)))).x);}`));
// Translation is decomposed on CPU into integer origin and small fraction.
// This keeps original F64 offsets, without unbounded GPU float→i32 casts.
export const innerShadow=k('inner-shadow',2,11,guardedSampler(10).replace('if(paramU32(0u)!=0u)','if(true)')+`
fn pixel(p:vec2u)->vec4f{let x=add(pair(vec4f(f32(p.x)+paramF32(9u))),scalar(5u));let y=add(pair(vec4f(f32(p.y)+paramF32(9u))),scalar(7u));let soft=bilinearPair(x,y);let mask=Pair(vec4f(soft.hi.a),vec4f(soft.lo.a));let ink=vec4f(paramF32(2u),paramF32(3u),paramF32(4u),1.);
 // Original isolated layer: tint*soft -> F32 publication, then source Alpha
 // and opacity are applied by the isolated parent in that precise order.
 let tinted=rounded(multiply(pair(ink),mask));let coverage=multiply(scalar(0u),pair(vec4f(read1(vec2i(p)).a)));return rounded(multiply(pair(tinted),coverage));}`);
export const coverage:GpuPixelKernelSourceV2={...k('coverage-ink',0,9,guardedMath(8,head+`
fn pixel(p:vec2u)->vec4f{let index=2u*(p.y*outputSize().x+p.x);let a=constant(data0(index),data0(index+1u));let ink=Pair(vec4f(paramF32(0u),paramF32(2u),paramF32(4u),1.),vec4f(paramF32(1u),paramF32(3u),paramF32(5u),0.));return rounded(multiply(multiply(ink,scalar(6u)),a));}`)),abiVersion:2,dataInputs:[{type:'f32'}]};
