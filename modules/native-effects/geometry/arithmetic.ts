import {pixelCompensatedArithmetic} from '../../gpu-effects/pixel-effects.ts';
/** Identical guarded residual arithmetic to the qualified PA displacement.
 * Uniform word7 is always zero; a runtime bit operation prevents reassociation. */
export function guarded(body:string){return `fn round32(v:vec4f)->vec4f{return bitcast<vec4f>(bitcast<vec4u>(v)^vec4u(paramU32(7u)));}\n`+body
 .replace('let sum=hi+lo;','let sum=round32(hi+lo);').replace('let error=lo-(sum-hi);','let error=round32(lo-round32(sum-hi));')
 .replace('let sum=a.hi+b.hi;','let sum=round32(a.hi+b.hi);').replace('let virtualB=sum-a.hi;','let virtualB=round32(sum-a.hi);').replace('let error=(a.hi-(sum-virtualB))+(b.hi-virtualB);','let error=round32(round32(a.hi-round32(sum-virtualB))+round32(b.hi-virtualB));').replace('return normalize(sum,(error+a.lo)+b.lo);','return normalize(sum,round32(round32(error+a.lo)+b.lo));')
 .replace('let product=a.hi*b.hi;','let product=round32(a.hi*b.hi);').replace('let error=fma(a.hi,b.hi,-product);','let error=round32(fma(a.hi,b.hi,-product));').replace('let cross=(a.hi*b.lo+a.lo*b.hi)+a.lo*b.lo;','let cross=round32(round32(round32(a.hi*b.lo)+round32(a.lo*b.hi))+round32(a.lo*b.lo));').replace('return normalize(product,error+cross);','return normalize(product,round32(error+cross));')
 .replace('let product=value*weight.x;','let product=round32(value*weight.x);').replace('let error=fma(value,vec4f(weight.x),-product);','let error=round32(fma(value,vec4f(weight.x),-product));').replace('return normalize(product,error+value*weight.y);','return normalize(product,round32(error+round32(value*weight.y)));');}
export const arithmetic=pixelCompensatedArithmetic+`
fn scalar(v:f32)->Pair{return pair(vec4f(v));}
fn argP(i:u32)->Pair{return constant(paramF32(8u+i*2u),paramF32(9u+i*2u));}
fn arg(i:u32)->f32{return rounded(argP(i)).x;}
fn times(a:Pair,b:f32)->Pair{return multiply(a,scalar(b));}
fn dot3(x:Pair,y:Pair,i:u32)->Pair{return add(add(multiply(x,argP(i)),multiply(y,argP(i+1u))),argP(i+2u));}
`;
