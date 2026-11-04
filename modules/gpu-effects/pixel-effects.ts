import {EngineError} from '../../src/core/errors.ts';
import {gamutMatrix} from '../../src/media/color.ts';
import {linear709} from '../../src/media/surface.ts';
import {floatPassShader} from './float-pass-shaders.ts';
import type {GpuPixelScope,GpuPixelImage,GpuPixelKernelSource} from './pixel-types.ts';

/** Reuse the shipped compensated arithmetic, not a second blur/glow algorithm. */
export const pixelCompensatedArithmetic=floatPassShader.slice(floatPassShader.indexOf('struct Pair'),floatPassShader.indexOf('fn gaussian'));
export interface GpuResidentBlurOptions {radius:number;boundary?:'transparent'|'clamp';format?:'rgba16float'|'rgba32float';signal?:AbortSignal}
export interface GpuResidentGlowOptions extends GpuResidentBlurOptions {threshold?:number;intensity:number}
const kernel=(id:string,inputCount:number,parameterWords:number,code:string):GpuPixelKernelSource=>({abiVersion:1,id:'frameweave/'+id,version:'1.0.0',inputCount,parameterWords,code});
const canonical=kernel('float-canonical',1,0,`fn pixel(p:vec2u)->vec4f{
 let v=read0(vec2i(p));let a=v.a;let rgb=select(v.rgb*a,v.rgb,alpha0()==0u);let out=vec4f(select(rgb,vec3f(0.),a==0.),a);
 if((a!=0.&&a<0x1p-24f)||any(abs(out.rgb)>vec3f(65504.))||any((abs(out.rgb)>vec3f(0.))&(abs(out.rgb)<vec3f(0x1p-100f)))){return vec4f(bitcast<f32>(0x7fc00000u|(p.x&1023u)));}return out;
}`);
const gaussian=kernel('float-gaussian-axis',1,774,pixelCompensatedArithmetic+`
 fn pixel(p:vec2u)->vec4f{var total=pair(vec4f(0.));let radius=i32(paramU32(0u));let d=vec2i(size0());
 for(var k=-radius;k<=radius;k++){var q=vec2i(p);if(paramU32(1u)==0u){q.x+=k;}else{q.y+=k;}
  if(paramU32(2u)!=0u){q=clamp(q,vec2i(0),d-1);}else if(any(q<vec2i(0))||any(q>=d)){continue;}
  let i=4u+2u*u32(k+radius);total=add(total,weighted(read0(q),vec2f(paramF32(i),paramF32(i+1u))));}return rounded(total);
 }`);
const threshold=kernel('float-glow-threshold',1,8,pixelCompensatedArithmetic+`
 fn pixel(p:vec2u)->vec4f{let v=read0(vec2i(p));if(v.a==0.){return vec4f(0.);}
  var l=weighted(vec4f(v.r),vec2f(paramF32(2u),paramF32(3u)));l=add(l,weighted(vec4f(v.g),vec2f(paramF32(4u),paramF32(5u))));l=add(l,weighted(vec4f(v.b),vec2f(paramF32(6u),paramF32(7u))));
  let y=divide(l,pair(vec4f(v.a)));let limit=constant(paramF32(0u),paramF32(1u));if(!greater(y,limit)){return vec4f(0.);}
  return rounded(multiply(pair(v),subtract(pair(vec4f(1.)),divide(limit,y))));
 }`);
const combine=kernel('float-glow-combine',2,2,pixelCompensatedArithmetic+`
 fn pixel(p:vec2u)->vec4f{let v=read0(vec2i(p));let bloom=read1(vec2i(p));let intensity=constant(paramF32(0u),paramF32(1u));let rgb=rounded(add(pair(v),multiply(pair(bloom),intensity)));
 var coverage=multiply(pair(vec4f(bloom.a)),intensity);let zero=pair(vec4f(0.));let one=pair(vec4f(1.));if(greater(zero,coverage)){coverage=zero;}if(greater(coverage,one)){coverage=one;}
 let a=rounded(add(pair(vec4f(v.a)),multiply(subtract(one,pair(vec4f(v.a))),coverage))).x;return vec4f(rgb.rgb,a);
 }`);
const over=kernel('float-over',2,0,pixelCompensatedArithmetic+`
 fn pixel(p:vec2u)->vec4f{let a=read0(vec2i(p));let b=read1(vec2i(p));return rounded(add(pair(a),multiply(pair(b),subtract(pair(vec4f(1.)),pair(vec4f(a.a))))));}
`);
function split(values:number[]){return Float32Array.from(values.flatMap(v=>{const hi=Math.fround(v);return [hi,Math.fround(v-hi)];}));}
// Same coefficient construction as the shipped single-pass owner. Keep this
// adapter independent of the private sequence/displacement candidate files.
function scalar(v:number,min:number,max:number,name:string){if(!Number.isFinite(v)||v<min||v>max)throw new EngineError('E_MEDIA_GPU_PASS_PARAMETER','Invalid '+name);return v;}
function gaussianPlan(sigma:number,boundary:'transparent'|'clamp'|undefined){
 scalar(sigma,0,64,'radius');if(boundary!==undefined&&boundary!=='transparent'&&boundary!=='clamp')throw new EngineError('E_MEDIA_GPU_PASS_PARAMETER','Invalid boundary');
 const radius=Math.ceil(3*sigma),weights=sigma===0?[1]:Array.from({length:2*radius+1},(_,i)=>Math.exp(-.5*((i-radius)/sigma)**2)),sum=weights.reduce((a,b)=>a+b,0);if(sigma!==0)for(let i=0;i<weights.length;i++)weights[i]/=sum;
 return {radius,clamp:boundary==='clamp',coefficients:split(weights)};
}
function checkOptions(o:GpuResidentBlurOptions|GpuResidentGlowOptions,glow=false){if(!o||Object.keys(o).some(k=>!['radius','boundary','format','signal',...glow?['threshold','intensity']:[]].includes(k)))throw new EngineError('E_GPU_PIXEL_CONTRACT','Unknown resident effect option');}

/** A small adapter using the generic scope. New kernels need no Renderer edits.
 * F32 internal stores and explicit F16/F32 logical publication, PM output.
 * Canonical Alpha-zero behavior matches the existing PA-1 Blur/Glow profile. */
export function createGpuPixelEffects(scope:GpuPixelScope){
 async function axis(input:GpuPixelImage,radius:number,boundary:'transparent'|'clamp'|undefined,format:'rgba16float'|'rgba32float',signal?:AbortSignal){
  const plan=gaussianPlan(radius,boundary),k=await scope.compile(gaussian),p=new Uint32Array(774),f=new Float32Array(p.buffer);p[0]=plan.radius;p[2]=Number(plan.clamp);f.set(plan.coefficients,4);
  const h=await scope.run(k,[input],{parameters:p,output:{format:'rgba32float',alpha:'premultiplied'},signal});
  try{p[1]=1;return await scope.run(k,[h],{parameters:p,output:{format,alpha:'premultiplied'},signal});}finally{await scope.release(h);}
 }
 async function prepare(input:GpuPixelImage,signal?:AbortSignal){return scope.run(await scope.compile(canonical),[input],{output:{format:'rgba32float',alpha:'premultiplied'},signal});}
 return {
  async blur(input:GpuPixelImage,options:GpuResidentBlurOptions){
   checkOptions(options);gaussianPlan(options.radius,options.boundary);
   const source=await prepare(input,options.signal);try{return await axis(source,options.radius,options.boundary,options.format??input.info.format,options.signal);}finally{await scope.release(source);}
  },
  async glow(input:GpuPixelImage,options:GpuResidentGlowOptions){
   checkOptions(options,true);gaussianPlan(options.radius,options.boundary);scalar(options.threshold??1,0,1e6,'threshold');scalar(options.intensity,0,100,'intensity');
   const source=await prepare(input,options.signal);let bright:GpuPixelImage|undefined,bloom:GpuPixelImage|undefined;
   try{
    if(options.intensity===0)return await axis(source,0,options.boundary,options.format??input.info.format,options.signal);
    const m=gamutMatrix(input.info.color,linear709),luma=[0,1,2].map(c=>.2126*m[0][c]+.7152*m[1][c]+.0722*m[2][c]);
    bright=await scope.run(await scope.compile(threshold),[source],{parameters:split([options.threshold??1,...luma]),output:{format:'rgba32float',alpha:'premultiplied'},signal:options.signal});
    bloom=await axis(bright,options.radius,options.boundary,'rgba32float',options.signal);
    return await scope.run(await scope.compile(combine),[source,bloom],{parameters:split([options.intensity]),output:{format:options.format??input.info.format,alpha:'premultiplied'},signal:options.signal});
   }finally{if(bright)await scope.release(bright);if(bloom)await scope.release(bloom);await scope.release(source);}
  },
  async over(foreground:GpuPixelImage,background:GpuPixelImage,options:{format?:'rgba16float'|'rgba32float';signal?:AbortSignal}={}){
   if(Object.keys(options).some(k=>!['format','signal'].includes(k))||foreground.info.width!==background.info.width||foreground.info.height!==background.info.height||foreground.info.alpha==='straight'||background.info.alpha==='straight')throw new EngineError('E_GPU_PIXEL_CONTRACT','Resident over requires matching dimensions and PM/opaque inputs');
   return scope.run(await scope.compile(over),[foreground,background],{output:{format:options.format??foreground.info.format,alpha:'premultiplied'},signal:options.signal});
  },
 };
}
