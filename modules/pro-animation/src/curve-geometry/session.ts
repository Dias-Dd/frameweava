// SPDX-License-Identifier: Apache-2.0
// Own data-query lease around the ORIGINAL curve sampler. No second curve reader/runtime.
import {EngineError,diagnostic} from '../../../../src/core/errors.ts';
import * as graphics from '../../../graphics-contracts/index.ts';
import type {PathData,Coordinates2D} from '../../../graphics-contracts/types.ts';
import {createCurveSampler,type CurveKernel,type CurveSamplerOptions} from '../curve-sampler.ts';
export interface CurveGeometryKernel extends CurveKernel {geometry_query(mode:number,contour:number,segment:number,values:Float64Array,accuracy:number):Promise<number>;geometry_read(start:number,count:number):Promise<Float64Array>;geometry_clear():Promise<void>}
export type CurveGeometryFactory=(options:{signal:AbortSignal})=>Promise<CurveGeometryKernel>;
export interface GeometryQuery {contour?:number;signal?:AbortSignal}
export interface GeometrySegment extends GeometryQuery {segment:number}
export type GeometryPoint=readonly [number,number];
declare const brand:unique symbol;
export interface CurveGeometry {readonly [brand]:true;readonly coordinates:Readonly<Coordinates2D>;readonly metrics:Awaited<ReturnType<typeof createCurveSampler>>['metrics'];dispose():Promise<{mode:'cooperative'|'terminated';remainingSessions?:number}>}
export interface State {kernel:CurveGeometryKernel;reader:Awaited<ReturnType<typeof createCurveSampler>>;header:Omit<PathData,'commands'>;controller:AbortController;closed:boolean;busy:boolean;pending?:Promise<unknown>;life?:AbortSignal;abort:()=>void;closing?:Promise<{mode:'cooperative'|'terminated';remainingSessions?:number}>}
const states=new WeakMap<object,State>();
export function fail(message:string,details?:unknown):never{throw new EngineError('E_PA_CURVE_GEOMETRY',message,{details});}
export function finite(n:number,name:string){if(typeof n!=='number'||!Number.isFinite(n))fail(name+' must be finite');return n;}
export function positive(n:number,name:string){finite(n,name);if(n<=0)fail(name+' must be positive');return n;}
export function integer(n:number,name:string){finite(n,name);if(!Number.isSafeInteger(n)||n<0)fail(name+' must be a nonnegative safe integer');return n;}
export function point(p:GeometryPoint):GeometryPoint{if(!Array.isArray(p)||p.length!==2)fail('Physical XY pair required');return [finite(p[0],'x'),finite(p[1],'y')];}
export function owned(engine:CurveGeometry){const s=states.get(engine);if(!s)fail('Use the owned original-curve geometry session');if(s.closed)throw new EngineError('E_PA_GEOMETRY_CLOSED','Curve geometry session closed');return s;}
export function contour(s:State,o:GeometryQuery){const c=o.contour??(s.reader.metrics.contours.length===1?0:undefined);if(c===undefined||!Number.isSafeInteger(c)||c<0||c>=s.reader.metrics.contours.length)fail('Choose one existing source contour explicitly');return c;}
export function check(s:State,o:GeometryQuery){if(s.controller.signal.aborted||o.signal?.aborted)throw new EngineError('E_RENDER_CANCELLED','Curve geometry query cancelled');if(s.closed)throw new EngineError('E_PA_GEOMETRY_CLOSED','Curve geometry session closed');}
export async function createCurveGeometry(factory:CurveGeometryFactory,input:PathData,options:CurveSamplerOptions={}):Promise<CurveGeometry>{
 if(options.signal?.aborted)throw new EngineError('E_RENDER_CANCELLED','Curve geometry initialization cancelled');const source=graphics.validatePathData(input),{commands:_,...header}=source,controller=new AbortController(),abort=()=>controller.abort();options.signal?.addEventListener('abort',abort,{once:true});let kernel:CurveGeometryKernel|undefined,reader:Awaited<ReturnType<typeof createCurveSampler>>;
 try{reader=await createCurveSampler(graphics,async o=>(kernel=await factory(o)),source,{...options,signal:controller.signal});if(options.signal?.aborted){controller.abort();await reader.dispose();throw new EngineError('E_RENDER_CANCELLED','Curve geometry initialization cancelled');}}catch(error){controller.abort();options.signal?.removeEventListener('abort',abort);throw error;}
 let s:State;const result={coordinates:reader.coordinates,metrics:reader.metrics,dispose(){if(s.closing)return s.closing;s.closed=true;if(s.busy)controller.abort();return s.closing=(async()=>{try{await s.pending?.catch(()=>{});return await reader.dispose();}finally{controller.abort();options.signal?.removeEventListener('abort',abort);}})();}} as CurveGeometry;
 s={kernel:kernel!,reader,header,controller,closed:false,busy:false,life:options.signal,abort};states.set(result,s);return Object.freeze(result);
}
export function run<T>(engine:CurveGeometry,o:GeometryQuery,work:(s:State)=>Promise<T>):Promise<T>{
 let s:State;try{s=owned(engine);check(s,o);if(s.busy)throw new EngineError('E_PA_GEOMETRY_BUSY','Await the current owned geometry query');}catch(error){return Promise.reject(error);}s.busy=true;const abort=()=>{s.closed=true;s.controller.abort();};o.signal?.addEventListener('abort',abort,{once:true});
 const pending=(async()=>{let primary:unknown;try{check(s,o);const value=await work(s);check(s,o);return value;}catch(error){primary=error;if(error instanceof EngineError)throw error;const message=String(error),code=message.match(/\b(E_[A-Z0-9_]+):/)?.[1]??'E_PA_CURVE_GEOMETRY';throw new EngineError(code,message,{details:{cause:diagnostic(error)}});}finally{try{if(!s.closed&&!s.controller.signal.aborted)await s.kernel.geometry_clear();}catch(cleanup){abort();throw new EngineError('E_PA_GEOMETRY_CLEANUP','Owned query cleanup failed',{details:{primary:diagnostic(primary),cleanup:diagnostic(cleanup)}});}finally{o.signal?.removeEventListener('abort',abort);s.busy=false;}}})();s.pending=pending;void pending.then(()=>{if(s.pending===pending)s.pending=undefined;},()=>{if(s.pending===pending)s.pending=undefined;});return pending;
}
export async function query(s:State,mode:number,o:GeometryQuery,segment=0,words:readonly number[]=[],accuracy=1e-9){check(s,o);const n=integer(await s.kernel.geometry_query(mode,contour(s,o),integer(segment,'source segment'),Float64Array.from(words),positive(accuracy,'accuracy')),'result length'),result:number[]=[];for(let start=0;start<n;start+=4096){check(s,o);const size=Math.min(4096,n-start),values=await s.kernel.geometry_read(start,size);if(!(values instanceof Float64Array)||values.length!==size||values.some(v=>!Number.isFinite(v)))fail('Finite original F64 data rows required');for(const value of values)result.push(value);}return result;}
