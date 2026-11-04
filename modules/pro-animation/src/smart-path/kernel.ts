// SPDX-License-Identifier: Apache-2.0
// Owned typed data adapter to pinned EffectCraft Rust. Not a scheduler/cache store.
import {EngineError,diagnostic} from '../../../../src/core/errors.ts';
import {evaluate} from '../../../../src/core/animation.ts';
import type {FrameContext,Signal} from '../../../../src/core/types.ts';
import * as graphics from '../../../graphics-contracts/index.ts';
import type {PathData} from '../../../graphics-contracts/types.ts';
import {frozen} from '../text-layout/common.ts';
import {contourRows,rowsToPath,splitPathContours,joinPathContours,pathFail,type ContourRows} from './geometry.ts';
const algorithm='effectcraft/path-interp@861c51f8187bf56efc77cc7b60fc4a513d2b7198';
export interface SmartMorphKernel {
 begin_input(closed:boolean):Promise<void>;append_input(values:Float64Array):Promise<void>;finish_input(slot:number):Promise<void>;
 resolve(mode:number,value:number,settings:Float64Array,maxVertices:number):Promise<number>;
 output_info(index:number):Promise<Float64Array>;read_output(index:number,start:number,count:number):Promise<Float64Array>;
 data_len():Promise<number>;read_data(start:number,count:number):Promise<Float64Array>;
 reset_results():Promise<void>;clear():Promise<void>;dispose():Promise<{remainingSessions:number}>;
}
export type SmartMorphFactory=(options:{signal:AbortSignal})=>Promise<SmartMorphKernel>;
export interface MorphQuery {signal?:AbortSignal}
export interface SmartMorphOptions extends MorphQuery {
 linear?:boolean;bendingResistance?:number;quality?:number;matching?:'auto'|'curve'|'polyline';
 oneToOne?:boolean;firstVerticesMatch?:boolean;
 addVertices?:{mode:'pixels'|'total'|'percent';value:number}|null;
 /** Equal contour count and explicit mapping for compounds; no guessed hole identity. */
 contourMap?:readonly number[];
}
type Controls=Required<Omit<SmartMorphOptions,'signal'|'contourMap'>>;
export interface PreparedSmartMorph {readonly algorithm:typeof algorithm;readonly from:PathData;readonly to:PathData;readonly controls:Controls;readonly diagnostics:readonly {contour:number;targetContour:number;fromVertices:number;toVertices:number;preparedVertices:number;closed:boolean}[]}
declare const brand:unique symbol;
export interface SmartMorphEngine {readonly [brand]:true;dispose():Promise<{mode:'cooperative';remainingSessions:number}|{mode:'terminated'}>}
interface State {kernel:SmartMorphKernel;controller?:AbortController;closed:boolean;busy:boolean;terminated:boolean;pending?:Promise<unknown>;closing?:Promise<{mode:'cooperative';remainingSessions:number}|{mode:'terminated'}>;cached?:{plan:PreparedSmartMorph;contour:number};life?:AbortSignal;abort:()=>void}
const sessions=new WeakMap<object,State>();
const number=(v:number,name:string)=>{if(typeof v!=='number'||!Number.isFinite(v))pathFail(name+' must be finite');return v;};
const integer=(v:number,name:string)=>{number(v,name);if(!Number.isSafeInteger(v)||v<0)pathFail(name+' must be a nonnegative safe integer');return v;};
function state(engine:SmartMorphEngine):State{const s=sessions.get(engine);if(!s)throw new EngineError('E_PA_SMART_OWNER','Owned smart-morph engine required');if(s.closed)throw new EngineError('E_PA_SMART_CLOSED','Smart morph engine closed');return s;}
function check(s:State,o:MorphQuery){if(o.signal?.aborted||s.life?.aborted||s.controller?.signal.aborted)throw new EngineError('E_RENDER_CANCELLED','Smart path operation cancelled');if(s.closed)throw new EngineError('E_PA_SMART_CLOSED','Smart morph engine closed');}
function controls(o:SmartMorphOptions={}):Controls {
 const p={linear:o.linear??false,bendingResistance:number(o.bendingResistance??50,'bendingResistance'),quality:number(o.quality??50,'quality'),matching:o.matching??'curve',oneToOne:o.oneToOne??false,firstVerticesMatch:o.firstVerticesMatch??true,addVertices:structuredClone(o.addVertices===undefined?{mode:'pixels' as const,value:15}:o.addVertices)};
 if(typeof p.linear!=='boolean'||typeof p.oneToOne!=='boolean'||typeof p.firstVerticesMatch!=='boolean'||p.bendingResistance<0||p.bendingResistance>100||p.quality<0||p.quality>100||!['auto','curve','polyline'].includes(p.matching))pathFail('Documented interpolation controls required');
 if(p.addVertices){const a=p.addVertices;if(!['pixels','total','percent'].includes(a.mode)||number(a.value,'addVertices.value')<=0||a.mode==='total'&&!Number.isSafeInteger(a.value)||a.mode==='percent'&&a.value>100)pathFail('Positive pixels/total/percent values required');}
 return frozen(p);
}
function words(o:Controls){return new Float64Array([Number(o.linear),o.bendingResistance,o.quality,['auto','curve','polyline'].indexOf(o.matching),Number(o.oneToOne),Number(o.firstVerticesMatch),o.addVertices?['pixels','total','percent'].indexOf(o.addVertices.mode)+1:0,o.addVertices?.value??0]);}
const floats=(v:Float64Array,length?:number)=>{if(!(v instanceof Float64Array)||length!==undefined&&v.length!==length||v.some(n=>!Number.isFinite(n)))pathFail('Finite original Float64 result rows required');return v;};
/** Same existing Kit lifetime. No inferred arbitrary module path/export name. */
export async function createSmartMorphEngine(factory:SmartMorphFactory,options:MorphQuery={}):Promise<SmartMorphEngine>{
 return smartMorphSession(signal=>factory({signal:signal!}),options,true);
}
/** Adopt an already admitted direct Kit kernel. No DOM controller/worker required.
 * The same session, original Rust, result reset and disposal contract is reused. */
export async function createSmartMorphEngineFromKernel(kernel:SmartMorphKernel,options:MorphQuery={}):Promise<SmartMorphEngine>{
 let adopted=false;try{return await smartMorphSession(async()=>{adopted=true;return kernel;},options,false);}catch(error){if(!adopted)try{await kernel.dispose();}catch(cleanup){throw new EngineError('E_PA_SMART_CLEANUP','Direct morph adoption and cleanup failed',{details:{primary:diagnostic(error),cleanup:diagnostic(cleanup)}});}throw error;}
}
async function smartMorphSession(factory:(signal?:AbortSignal)=>Promise<SmartMorphKernel>,options:MorphQuery,controllerNeeded:boolean):Promise<SmartMorphEngine>{
 if(options.signal?.aborted)throw new EngineError('E_RENDER_CANCELLED','Smart morph initialization cancelled');const controller=controllerNeeded?new AbortController():undefined;let s:State|undefined;
 const abort=()=>{controller?.abort();if(s){s.closed=true;s.terminated=Boolean(controller);s.cached=undefined;}};options.signal?.addEventListener('abort',abort,{once:true});
 let kernel:SmartMorphKernel;try{kernel=await factory(controller?.signal);}catch(error){options.signal?.removeEventListener('abort',abort);controller?.abort();throw error;}
 if(options.signal?.aborted){abort();await kernel.dispose();throw new EngineError('E_RENDER_CANCELLED','Smart morph initialization cancelled');}
 const handle={dispose(){if(s!.closing)return s!.closing;s!.closed=true;s!.cached=undefined;if(s!.busy){s!.terminated=Boolean(controller);controller?.abort();}
  return s!.closing=(async()=>{try{await s!.pending?.catch(()=>{});const result=await kernel.dispose();return s!.terminated?{mode:'terminated' as const}:{mode:'cooperative' as const,remainingSessions:result.remainingSessions};}finally{controller?.abort();options.signal?.removeEventListener('abort',abort);}})();
 }} as SmartMorphEngine;
 s={kernel,controller,closed:false,busy:false,terminated:false,life:options.signal,abort};sessions.set(handle,s);return Object.freeze(handle);
}
function run<T>(engine:SmartMorphEngine,o:MorphQuery,work:(s:State)=>Promise<T>):Promise<T>{
 let s:State;try{s=state(engine);check(s,o);if(s.busy)throw new EngineError('E_PA_SMART_BUSY','Await the current owned path operation');}catch(error){return Promise.reject(error);}
 s.busy=true;const abort=()=>{s.closed=true;s.terminated=Boolean(s.controller);s.cached=undefined;s.controller?.abort();};o.signal?.addEventListener('abort',abort,{once:true});
 const task=(async()=>{let primary:unknown;try{check(s,o);const result=await work(s);check(s,o);return result;}catch(error){primary=error;if(error instanceof EngineError)throw error;const message=String(error),code=message.match(/\b(E_[A-Z0-9_]+):/)?.[1]??'E_PA_SMART_PATH';throw new EngineError(code,message,{details:{cause:diagnostic(error)}});}finally{
  try{if(!s.closed)await s.kernel.reset_results();}catch(cleanup){abort();throw new EngineError('E_PA_SMART_CLEANUP','Original owned path result cleanup failed',{details:{primary:diagnostic(primary),cleanup:diagnostic(cleanup)}});}finally{o.signal?.removeEventListener('abort',abort);s.busy=false;}
 }})();s.pending=task;void task.then(()=>{if(s.pending===task)s.pending=undefined;},()=>{if(s.pending===task)s.pending=undefined;});return task;
}
async function load(s:State,path:PathData,slot:number,o:MorphQuery){
 const p=graphics.validatePathData(path);if(p.coordinates.unit!=='px')pathFail('Explicit physical pixel coordinates required');const rows=contourRows(p);await s.kernel.begin_input(rows.closed);let data:number[]=[];
 for(let i=0;i<rows.vertices.length;i++){check(s,o);data.push(...rows.vertices[i],...rows.incoming[i],...rows.outgoing[i]);if(data.length>=1536){await s.kernel.append_input(Float64Array.from(data));data=[];}}
 if(data.length)await s.kernel.append_input(Float64Array.from(data));await s.kernel.finish_input(slot);check(s,o);
}
async function output(s:State,template:PathData,index:number,o:MorphQuery):Promise<PathData>{
 const info=floats(await s.kernel.output_info(index),2),count=integer(info[0],'output vertex count');if(![0,1].includes(info[1])||count<1||count+2>graphics.LIMITS.commands)throw new EngineError('E_GRAPHICS_LIMIT','Output contour exceeds existing canonical command budget');
 const rows:ContourRows={closed:Boolean(info[1]),vertices:[],incoming:[],outgoing:[]};
 for(let start=0;start<count;start+=256){check(s,o);const n=Math.min(256,count-start),values=floats(await s.kernel.read_output(index,start,n),n*6);for(let i=0;i<n;i++){const at=i*6;rows.vertices.push([values[at],values[at+1]]);rows.incoming.push([values[at+2],values[at+3]]);rows.outgoing.push([values[at+4],values[at+5]]);}}
 return rowsToPath(template,rows);
}
async function data(s:State,o:MorphQuery){const n=integer(await s.kernel.data_len(),'diagnostic length'),out:number[]=[];for(let start=0;start<n;start+=4096){check(s,o);const size=Math.min(4096,n-start);for(const value of floats(await s.kernel.read_data(start,size),size))out.push(value);}return out;}
const maximum=()=>graphics.LIMITS.commands-2;
async function one(engine:SmartMorphEngine,input:PathData,mode:number,value:number,o:MorphQuery){const path=graphics.validatePathData(input);return run(engine,o,async s=>{s.cached=undefined;await s.kernel.clear();await load(s,path,0,o);const count=await s.kernel.resolve(mode,value,new Float64Array(),maximum());if(count!==1)pathFail('One original path result expected');return output(s,path,0,o);});}
export async function reverseSmartPath(engine:SmartMorphEngine,input:PathData,o:MorphQuery={}){return one(engine,input,0,0,o);}
export async function rotateSmartPath(engine:SmartMorphEngine,input:PathData,startVertex:number,o:MorphQuery={}){return one(engine,input,1,integer(startVertex,'startVertex'),o);}
export async function insertPathVertices(engine:SmartMorphEngine,input:PathData,count:number,o:MorphQuery={}){return one(engine,input,2,integer(count,'vertex count'),o);}
export async function resampleSmartPath(engine:SmartMorphEngine,input:PathData,count:number,o:MorphQuery={}){return one(engine,input,3,integer(count,'vertex count'),o);}
export async function prepareSmartMorph(engine:SmartMorphEngine,from:PathData,to:PathData,o:SmartMorphOptions={}):Promise<PreparedSmartMorph>{
 const a=graphics.validatePathData(from),b=graphics.validatePathData(to),settings=controls(o);if(JSON.stringify(a.coordinates)!==JSON.stringify(b.coordinates)||a.fillRule!==b.fillRule)pathFail('Identical coordinate spaces and fill rule required');
 const aa=splitPathContours(a),bb=splitPathContours(b),map=o.contourMap?[...o.contourMap]:aa.map((_,i)=>i);
 if(aa.length!==bb.length||map.length!==aa.length||new Set(map).size!==map.length||map.some(i=>!Number.isSafeInteger(i)||i<0||i>=bb.length)||aa.length>1&&!o.contourMap)pathFail('Equal contour counts with explicit one-to-one compound/holes mapping required');
 return run(engine,o,async s=>{s.cached=undefined;const ra:PathData[]=[],rb:PathData[]=[],diagnostics:PreparedSmartMorph['diagnostics'][number][]=[];for(const [i,target]of map.entries()){
  check(s,o);await s.kernel.clear();await load(s,aa[i],0,o);await load(s,bb[target],1,o);if(await s.kernel.resolve(4,0,words(settings),maximum())!==2)pathFail('Two original correspondence results required');
  const pa=await output(s,aa[i],0,o),pb=await output(s,bb[target],1,o);ra.push(pa);rb.push(pb);diagnostics.push({contour:i,targetContour:target,fromVertices:contourRows(aa[i]).vertices.length,toVertices:contourRows(bb[target]).vertices.length,preparedVertices:contourRows(pa).vertices.length,closed:contourRows(pa).closed});
 }return frozen({algorithm,from:joinPathContours(ra),to:joinPathContours(rb),controls:settings,diagnostics});});
}
function immutablePath(p:PathData){return Object.isFrozen(p)&&Object.isFrozen(p.commands)&&p.commands.every(c=>Object.isFrozen(c)&&(c.op==='Z'||Object.isFrozen(c.point)&&(c.op!=='Q'||Object.isFrozen(c.control))&&(c.op!=='C'||Object.isFrozen(c.control1)&&Object.isFrozen(c.control2))));}
function plan(p:PreparedSmartMorph){if(p?.algorithm!==algorithm)pathFail('Reviewed original algorithm identity required');const a=splitPathContours(p.from),b=splitPathContours(p.to);if(a.length!==b.length)pathFail('Frozen correspondence contour counts differ');for(let i=0;i<a.length;i++){const aa=contourRows(a[i]),bb=contourRows(b[i]);if(aa.closed!==bb.closed||aa.vertices.length!==bb.vertices.length)pathFail('Frozen correspondence closure/vertex counts differ');}return controls(p.controls);}
export async function interpolateSmartMorph(engine:SmartMorphEngine,input:PreparedSmartMorph,progress:Signal<number>,context?:FrameContext,o:MorphQuery&{boundary?:'error'|'extrapolate'}={}):Promise<PathData>{
 const settings=plan(input);if(typeof progress!=='number'&&!context)pathFail('Existing Signal requires explicit FrameContext');const t=number(typeof progress==='number'?progress:evaluate(progress,context!),'progress');if(!['error','extrapolate'].includes(o.boundary??'error')||(o.boundary??'error')==='error'&&(t<0||t>1))pathFail('Progress outside[0,1]; explicitly opt into extrapolation');
 const a=splitPathContours(input.from),b=splitPathContours(input.to);if(a.length!==b.length)pathFail('Frozen correspondence contour counts differ');
 return run(engine,o,async s=>{const result:PathData[]=[];for(let i=0;i<a.length;i++){check(s,o);if(!Object.isFrozen(input)||!Object.isFrozen(input.controls)||!immutablePath(input.from)||!immutablePath(input.to)||s.cached?.plan!==input||s.cached.contour!==i){await s.kernel.clear();await load(s,a[i],0,o);await load(s,b[i],1,o);await s.kernel.resolve(10,0,words(settings),maximum());s.cached={plan:input,contour:i};}if(await s.kernel.resolve(5,t,words(settings),maximum())!==1)pathFail('One original interpolated contour expected');result.push(await output(s,a[i],0,o));}return joinPathContours(result);});
}
async function inspect(engine:SmartMorphEngine,a:PathData,b:PathData|undefined,mode:number,value:number,o:MorphQuery){return run(engine,o,async s=>{s.cached=undefined;await s.kernel.clear();await load(s,a,0,o);if(b)await load(s,b,1,o);await s.kernel.resolve(mode,value,new Float64Array(),maximum());return data(s,o);});}
export async function morphMatchCost(engine:SmartMorphEngine,prepared:PreparedSmartMorph,o:MorphQuery&{shapeContext?:boolean}={}):Promise<readonly number[]>{plan(prepared);const a=splitPathContours(prepared.from),b=splitPathContours(prepared.to),out:number[]=[];for(let i=0;i<a.length;i++)out.push((await inspect(engine,a[i],b[i],7,Number(o.shapeContext??true),o))[0]);return frozen(out);}
export async function morphCrossings(engine:SmartMorphEngine,prepared:PreparedSmartMorph,o:MorphQuery={}):Promise<readonly number[]>{plan(prepared);const a=splitPathContours(prepared.from),b=splitPathContours(prepared.to),out:number[]=[];for(let i=0;i<a.length;i++)out.push(integer((await inspect(engine,a[i],b[i],8,0,o))[0],'straight-link crossings'));return frozen(out);}
export async function morphShapeContexts(engine:SmartMorphEngine,input:PathData,o:MorphQuery={}){const rows=contourRows(input),values=await inspect(engine,input,undefined,6,0,o);if(values.length!==rows.vertices.length*60)pathFail('Original5x12 shape-context descriptor rows required');return frozen({vertices:rows.vertices.length,radialBins:5,angularBins:12,values});}
export async function morphMetrics(engine:SmartMorphEngine,input:PathData,o:MorphQuery={}){const a=await inspect(engine,input,undefined,9,0,o);if(a.length!==7)pathFail('Original shape metrics required');return frozen({vertices:integer(a[0],'vertices'),closed:Boolean(a[1]),approximateOutlineLength:a[2],vertexPolygonArea:a[3],vertexMean:[a[4],a[5]],rmsRadius:a[6],semantics:'Original upstream24-sample-per-segment length; vertex-polygon area/mean/RMS are matching diagnostics, not exact curve integrals'});}
export function* morphVertexPaths(input:PreparedSmartMorph):Generator<PathData>{plan(input);const aa=splitPathContours(input.from),bb=splitPathContours(input.to);let ordinal=0;for(let c=0;c<aa.length;c++){const a=contourRows(aa[c]),b=contourRows(bb[c]);if(a.vertices.length!==b.vertices.length)pathFail('Equal frozen vertex correspondence required');for(let i=0;i<a.vertices.length;i++)yield graphics.validatePathData({...aa[c],id:'morph.link.'+(ordinal++),commands:[{op:'M',point:{id:'a',x:a.vertices[i][0],y:a.vertices[i][1]}},{op:'L',point:{id:'b',x:b.vertices[i][0],y:b.vertices[i][1]}}]});}}
