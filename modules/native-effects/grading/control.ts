import {EngineError} from '../../../src/core/errors.ts';
import {evaluate} from '../../../src/core/animation.ts';
import {parseCube,type CubeLut,gamutMatrix} from '../../../src/media/color.ts';
import {linear709,type ColorEncoding} from '../../../src/media/surface.ts';
import type {FrameContext,Signal} from '../../../src/core/types.ts';
import type {GradeOutput,LutDefinition,LutEncoding,Triple,Curve} from './types.ts';
export function fail(effect:string,path:string,expected:string,unit?:string):never{throw new EngineError('E_NATIVE_GRADE_PARAMETER',`${effect}.${path}: expected ${expected}${unit?' ('+unit+')':''}`,{details:{effect,path,expected,...unit?{unit}:{}}});}
export function number(v:number,path:string,effect='grading',min=-Infinity,max=Infinity){if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max||!Number.isFinite(Math.fround(v))||v!==0&&Math.abs(Math.fround(v))<2**-126)fail(effect,path,`zero or normal finite Float32-representable number in [${min},${max}]`);return v;}
export function controls(effect:string,context?:FrameContext,outer?:AbortSignal){
 const active=(s?:AbortSignal)=>{if(outer?.aborted||s?.aborted)throw new EngineError('E_RENDER_CANCELLED',effect+': cancelled before recording',{details:{effect}});};
 const scalar=(v:Signal<number>|undefined,fallback:number,path:string,min=-Infinity,max=Infinity)=>{if(v!==undefined&&typeof v!=='number'&&!context)fail(effect,path,'number, or Signal with explicit FrameContext');const x=v===undefined?fallback:typeof v==='number'?v:evaluate(v,context!);return number(x,path,effect,min,max);};
 const triple=(v:Triple|undefined,fallback:readonly [number,number,number],path:string,min=-Infinity)=>{const a=v===undefined?fallback:v;if(!Array.isArray(a)||a.length!==3||[0,1,2].some(i=>a[i]===undefined))fail(effect,path,'three present numeric/Signal leaves');return a.map((x,i)=>scalar(x,0,path+'['+i+']',min));};
 const choice=<T extends string>(v:T|undefined,fallback:T,values:readonly T[],path:string)=>{if(v!==undefined&&!values.includes(v))fail(effect,path,values.join(' | '));return v??fallback;};
 function fields(o:GradeOutput,extra:readonly string[]){if(!o||typeof o!=='object'||Array.isArray(o))fail(effect,'options','options object');for(const key of Object.keys(o))if(!['format','signal','amount','workingColor',...extra].includes(key))fail(effect,key,'a documented option');if(o.format!==undefined&&!['rgba16float','rgba32float'].includes(o.format))fail(effect,'format','rgba16float | rgba32float');if(o.signal!==undefined&&!(o.signal instanceof AbortSignal))fail(effect,'signal','AbortSignal');active(o.signal);}
 return {active,scalar,triple,choice,fields};
}
/** Explicit immutable table. Original Cube parser is reused; no filesystem or
 * network access is added to the Stage. Table values are copied before caching. */
const prepared=new WeakSet<LutDefinition>();
export function checkedLut(lut:LutDefinition){if(!lut||!prepared.has(lut))fail('grading','lut','immutable table returned by defineLut/cubeLut in this module');}
export function defineLut(lut:CubeLut,options:{inputEncoding:LutEncoding;outputEncoding:LutEncoding}):LutDefinition{
 if(!options||Object.keys(options).some(k=>!['inputEncoding','outputEncoding'].includes(k))||!['linear','srgb','acescct'].includes(options.inputEncoding)||!['linear','srgb','acescct'].includes(options.outputEncoding))fail('defineLut','encoding','explicit inputEncoding/outputEncoding: linear | srgb | acescct');
 if(!lut||Object.keys(lut).some(k=>!['kind','size','domainMin','domainMax','values'].includes(k))||!['1d','3d'].includes(lut.kind)||!Number.isSafeInteger(lut.size)||lut.size<2)fail('defineLut','lut','existing CubeLut structure');
 const count=(lut.kind==='1d'?lut.size:lut.size**3)*3;if(!Number.isSafeInteger(count)||count>0x1fffffff||!Array.isArray(lut.values)||lut.values.length!==count)fail('defineLut','values','exact safe table population fitting uint32 storage words');
 const domain=(v:readonly number[],path:string)=>{if(!Array.isArray(v)||v.length!==3)fail('defineLut',path,'three finite components');return Object.freeze(Array.from(v,(x,i)=>number(x,path+'['+i+']','defineLut'))) as readonly [number,number,number];};
 const lo=domain(lut.domainMin,'domainMin'),hi=domain(lut.domainMax,'domainMax');if(lo.some((x,i)=>x>=hi[i]))fail('defineLut','domainMax','strictly greater than domainMin on every channel');
 const result=Object.freeze({kind:lut.kind,size:lut.size,domainMin:lo,domainMax:hi,values:Object.freeze(Array.from(lut.values,(v,i)=>number(v,'values['+i+']','defineLut'))),...options});prepared.add(result);return result;
}
export const cubeLut=(text:string,encoding:{inputEncoding:LutEncoding;outputEncoding:LutEncoding})=>defineLut(parseCube(text),encoding);
export function curve(points:Curve,cyclic=false){if(!Array.isArray(points)||points.length<2||points.length>0x1fffffff)fail('curve','points','at least two knots within uint32 storage addressing');const result:number[]=[];for(const [i,p]of points.entries()){if(!Array.isArray(p)||p.length!==2)fail('curve','points['+i+']','[x,y]');const x=number(p[0],'x','curve'),y=number(p[1],'y','curve');if(i>0&&x<=points[i-1][0])fail('curve','x','strictly increasing binary64 coordinates');result.push(x,y);}if(cyclic&&(points[0][0]!==0||points.at(-1)![0]!==360||points[0][1]!==points.at(-1)![1]))fail('curve','points','cyclic 0..360 degree endpoints with equal values');return result;}
type M=number[][];
const mul=(a:M,b:M)=>a.map(r=>b[0].map((_,j)=>r.reduce((s,v,k)=>s+v*b[k][j],0)));
function inverse(a:M){const [[a0,b,c],[d,e,f],[g,h,i]]=a,det=a0*(e*i-f*h)-b*(d*i-f*g)+c*(d*h-e*g);if(!Number.isFinite(det)||det===0)fail('whiteBalance','matrix','invertible color matrix');return [[e*i-f*h,c*h-b*i,b*f-c*e],[f*g-d*i,a0*i-c*g,c*d-a0*f],[d*h-e*g,b*g-a0*h,a0*e-b*d]].map(r=>r.map(v=>v/det));}
/** Bradford adaptation expressed in the actual existing working RGB primaries. */
export function whiteBalanceMatrix(color:ColorEncoding,source:readonly [number,number],target:readonly [number,number]){
 const xyz=(w:readonly [number,number],path:string)=>{if(!Array.isArray(w)||w.length!==2||w.some(n=>!Number.isFinite(n))||w[0]<=0||w[1]<=0||w[0]+w[1]>=1)fail('whiteBalance',path,'valid positive CIE xy white');w.forEach((v,i)=>number(v,path+'['+i+']','whiteBalance'));return [w[0]/w[1],1,(1-w[0]-w[1])/w[1]];},a=xyz(source,'sourceWhite'),z=xyz(target,'targetWhite'),b=[[.8951,.2664,-.1614],[-.7502,1.7135,.0367],[.0389,-.0685,1.0296]],apply=(m:M,v:number[])=>m.map(r=>r.reduce((s,n,i)=>s+n*v[i],0)),from=apply(b,a),to=apply(b,z);if(from.some(n=>n<=0)||to.some(n=>n<=0))fail('whiteBalance','white','positive Bradford cone response');
 const rgbToXyz709=[[.4123907992659595,.357584339383878,.1804807884018343],[.2126390058715104,.715168678767756,.0721923153607337],[.0193308187155919,.119194779794626,.9505321522496606]],working=mul(rgbToXyz709,gamutMatrix(color,linear709)),cat=mul(inverse(b),b.map((r,i)=>r.map(n=>n*to[i]/from[i])));return mul(inverse(working),mul(cat,working)).flat().map((v,i)=>number(v,'matrix['+i+']','whiteBalance'));
}
