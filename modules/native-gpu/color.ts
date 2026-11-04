import type {ColorEncoding} from '../../src/media/surface.ts';
import {gamutMatrix} from '../../src/media/color.ts';
import {nativePixelShader,samePixelColor} from '../gpu-effects/pixel-shader.ts';
import type {GpuPixelImageInfo} from '../gpu-effects/pixel-types.ts';
import {EngineError} from '../../src/core/errors.ts';

/** Colorimetric scene-linear conversion. No view transform, tone map or clipping. */
export interface NativeColorConversion {
 version:1;color:ColorEncoding;format?:'rgba16float'|'rgba32float';signal?:AbortSignal;
}
export function nativeColorParameters(from:GpuPixelImageInfo['color'],to:GpuPixelImageInfo['color']){
 const matrix=gamutMatrix(from,to).flat().map(v=>v*(from.referenceWhiteNits/to.referenceWhiteNits)),p=new Float32Array(20);
 for(let i=0;i<9;i++){p[i*2]=matrix[i];p[i*2+1]=matrix[i]-p[i*2];}
 if(!matrix.every(Number.isFinite)||!p.every(Number.isFinite))throw new EngineError('E_NATIVE_COLOR','Color conversion coefficients exceed the F32 working range');
 p[19]=Number(samePixelColor(from,to));return p;
}
// Split coefficients and compensated dot products retain cancellation accuracy.
// Runtime zero XOR is a rounding barrier: drivers must not reassociate the
// residual arithmetic into a plain F32 dot product. Parameter 18 is always 0.
export const nativeColorShader=nativePixelShader({abiVersion:1,id:'frameweave/native/color-v1',version:'1.0.0',inputCount:1,parameterWords:20,code:`
fn rounded(x:f32)->f32{return bitcast<f32>(bitcast<u32>(x)^paramU32(18u));}
fn pairAdd(a:vec2f,b:vec2f)->vec2f{
 let s=rounded(a.x+b.x);let v=rounded(s-a.x);
 let e=rounded(rounded(a.x-rounded(s-v))+rounded(b.x-v));
 let t=rounded(rounded(a.y+b.y)+e);let h=rounded(s+t);
 return vec2f(h,rounded(t-rounded(h-s)));
}
fn pairMul(a:f32,b:f32)->vec2f{let p=rounded(a*b);return vec2f(p,fma(a,b,-p));}
fn term(i:u32,x:f32)->vec2f{return pairAdd(pairMul(paramF32(i),x),pairMul(paramF32(i+1u),x));}
fn row(i:u32,v:vec3f)->f32{let q=pairAdd(pairAdd(term(i,v.x),term(i+2u,v.y)),term(i+4u,v.z));return rounded(q.x+q.y);}
fn pixel(p:vec2u)->vec4f{
 let v=read0(vec2i(p));if(paramF32(19u)==1.){return v;}
 return vec4f(row(0u,v.rgb),row(6u,v.rgb),row(12u,v.rgb),v.a);
}`});
