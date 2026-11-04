import {evaluate} from '../../../src/core/animation.ts';
import {EngineError} from '../../../src/core/errors.ts';
import type {FrameContext,Signal} from '../../../src/core/types.ts';
export type Triple=readonly [Signal<number>,Signal<number>,Signal<number>];
export interface OutputOptions {format?:'rgba16float'|'rgba32float';signal?:AbortSignal}
export interface LevelsOptions extends OutputOptions {inputBlack?:Triple;inputWhite?:Triple;outputBlack?:Triple;outputWhite?:Triple;gamma?:Triple;clampInput?:boolean}
export interface ChannelMixOptions extends OutputOptions {matrix?:readonly [Triple,Triple,Triple];offset?:Triple}
export type CurvePoints=readonly (readonly [number,number])[];
export interface CurvesOptions extends OutputOptions {red?:CurvePoints;green?:CurvePoints;blue?:CurvePoints}
export interface UnsharpMaskOptions extends OutputOptions {radius?:Signal<number>;amount?:Signal<number>;boundary?:'clamp'|'transparent'}
export interface LumaKeyOptions extends OutputOptions {low?:Signal<number>;high?:Signal<number>;invert?:boolean}
export interface ChromaKeyOptions extends OutputOptions {color?:Triple;inner?:Signal<number>;outer?:Signal<number>;invert?:boolean}
export interface DespillOptions extends OutputOptions {channel?:'red'|'green'|'blue';amount?:Signal<number>;limit?:'max'|'average'}
export function fail(message:string):never{throw new EngineError('E_GPU_IMAGE_PARAMETER',message);}
export function fields(o:object,keys:readonly string[],name:string){if(!o||typeof o!=='object'||Array.isArray(o))fail(name+': options object required');for(const k of Object.keys(o))if(!['format','signal',...keys].includes(k))fail(name+'.'+k+': unknown option');const output=o as OutputOptions;if(output.format!==undefined&&!['rgba16float','rgba32float'].includes(output.format))fail('Output must remain RGBA16F/32F');if(output.signal!==undefined&&!(output.signal instanceof AbortSignal))fail('AbortSignal required');}
export function number(v:Signal<number>|undefined,fallback:number,name:string,ctx?:FrameContext,min=-Infinity,max=Infinity){
 const raw=v===undefined?fallback:v;if(typeof raw!=='number'&&(!raw||typeof raw!=='object'||Array.isArray(raw)))fail(name+': number/Signal required');if(typeof raw!=='number'&&!ctx)throw new EngineError('E_GPU_IMAGE_CONTEXT',name+': FrameContext required');
 const n=typeof raw==='number'?raw:evaluate(raw,ctx!);if(typeof n!=='number'||!Number.isFinite(n)||n<min||n>max)fail(name+': finite value outside its declared range');const f=Math.fround(n);if(!Number.isFinite(f)||f!==0&&Math.abs(f)<2**-126)fail(name+': zero or normal finite Float32 required');return f;
}
export function triple(v:Triple|undefined,fallback:readonly [number,number,number],name:string,ctx?:FrameContext){if(v!==undefined&&(!Array.isArray(v)||v.length!==3))fail(name+': three leaves required');return [0,1,2].map(i=>number(v?.[i],fallback[i],name+'['+i+']',ctx)) as [number,number,number];}
export function flag(v:boolean|undefined,fallback:boolean,name:string){if(v!==undefined&&typeof v!=='boolean')fail(name+': boolean required');return v??fallback;}
/** PCHIP/Fritsch-Carlson shape-preserving slopes, prepared from F32 knots.
 * Static colour curves; no animation interpolation or expression system. */
export function curveWords(points:CurvePoints|undefined){
 const source=points??[[0,0],[1,1]];if(!Array.isArray(source)||source.length<2||source.length>32)fail('Curves require 2..32 knots (uniform budget)');
 const x:number[]=[],y:number[]=[];for(const p of source){if(!Array.isArray(p)||p.length!==2)fail('Curve knot requires [x,y]');x.push(number(p[0],0,'curve.x'));y.push(number(p[1],0,'curve.y'));}
 const n=x.length,h:number[]=[],d:number[]=[],m=new Array<number>(n).fill(0);for(let i=0;i<n-1;i++){if(x[i+1]<=x[i])fail('Curve x must be strictly increasing after Float32 quantization');h.push(x[i+1]-x[i]);d.push((y[i+1]-y[i])/h[i]);}
 if(n===2)m.fill(d[0]);else{
  const end=(a:number,b:number,ha:number,hb:number)=>{const v=((2*ha+hb)*a-ha*b)/(ha+hb);if(Math.sign(v)!==Math.sign(a))return 0;return Math.sign(a)!==Math.sign(b)&&Math.abs(v)>Math.abs(3*a)?3*a:v;};m[0]=end(d[0],d[1],h[0],h[1]);m[n-1]=end(d[n-2],d[n-3],h[n-2],h[n-3]);
  for(let i=1;i<n-1;i++)if(d[i-1]!==0&&d[i]!==0&&Math.sign(d[i-1])===Math.sign(d[i])){const a=2*h[i]+h[i-1],b=h[i]+2*h[i-1];m[i]=(a+b)/(a/d[i-1]+b/d[i]);}
 }
 return [n,...x,...y,...m.map(v=>number(v,0,'curve tangent'))];
}
