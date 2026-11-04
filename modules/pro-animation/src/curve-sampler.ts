// SPDX-License-Identifier: Apache-2.0
// Thin prepared metric adapter. Original kurbo owns curve length/inversion/evaluation.
import {EngineError,diagnostic} from '../../../src/core/errors.ts';
import type {PathData,Coordinates2D} from '../../graphics-contracts/types.ts';
import type * as Graphics from '../../graphics-contracts/index.ts';
export interface CurveKernel {
 begin():Promise<void>;append(values:Float64Array):Promise<void>;prepare(accuracy:number):Promise<number>;
 contour_info(index:number):Promise<Float64Array>;sample(contour:number,distances:Float64Array,side:number):Promise<Float64Array>;
 diagnostics():Promise<unknown>;dispose():Promise<{remainingSessions:number}>;
}
export type CurveKernelFactory=(options:{signal:AbortSignal})=>Promise<CurveKernel>;
export interface CurveSamplerOptions {/** Absolute input-path length budget in px, allocated among original segments. */ accuracy?:number;signal?:AbortSignal}
export interface CurveQueryOptions {contour?:number;boundary?:'error'|'clamp'|'wrap';side?:'incoming'|'outgoing';signal?:AbortSignal}
export interface CurveSample {
 x:number;y:number;distance:number;contour:number;segment:number;parameter:number;
 tangent:readonly [number,number];tangentStatus:'derivative'|'endpoint-limit'|'undefined';angleRadians?:number;
}
function fail(code:string,message:string,details?:unknown):never {throw new EngineError(code,message,{details});}
export function createCurveSampler(graphics:Pick<typeof Graphics,'validatePathData'>,factory:CurveKernelFactory,input:PathData,options:CurveSamplerOptions={}){return curveSamplerSession(graphics,signal=>factory({signal:signal!}),input,options,true);}
/** Transfer one already verified direct Kit client. SpiderMonkey has no browser
 * AbortController global; no Worker/controller is invented for an owned WASM call. */
export async function createCurveSamplerFromKernel(graphics:Pick<typeof Graphics,'validatePathData'>,kernel:CurveKernel,input:PathData,options:CurveSamplerOptions={}){
 let adopted=false;try{return await curveSamplerSession(graphics,async()=>{adopted=true;return kernel;},input,options,false);}catch(error){if(!adopted)try{await kernel.dispose();}catch(cleanup){throw new EngineError('E_PA_CURVE_CLEANUP','Direct curve validation and cleanup failed',{details:{original:diagnostic(error),cleanup:diagnostic(cleanup)}});}throw error;}
}
async function curveSamplerSession(graphics:Pick<typeof Graphics,'validatePathData'>,factory:(signal?:AbortSignal)=>Promise<CurveKernel>,input:PathData,options:CurveSamplerOptions,controllerNeeded:boolean){
 const path=graphics.validatePathData(input),coordinates=Object.freeze({...path.coordinates}),accuracy=options.accuracy??1e-6,lifeSignal=options.signal;
 if(coordinates.unit!=='px')fail('E_PA_CURVE_SPACE','Curve lengths use declared physical pixels');
 if(!Number.isFinite(accuracy)||accuracy<=0)fail('E_PA_CURVE_ACCURACY','Positive finite path length budget required');
 if(lifeSignal?.aborted)fail('E_PA_CURVE_CANCELLED','Curve initialization cancelled');const controller=controllerNeeded?new AbortController():undefined;let closed=false,busy=false,terminated=false,disposal:Promise<{mode:'cooperative'|'terminated';remainingSessions?:number}>|undefined;
 const cancel=()=>{closed=true;terminated=Boolean(controller);controller?.abort();};lifeSignal?.addEventListener('abort',cancel,{once:true});if(lifeSignal?.aborted){lifeSignal.removeEventListener('abort',cancel);cancel();fail('E_PA_CURVE_CANCELLED','Curve initialization cancelled');}
 let kernel:CurveKernel;try{kernel=await factory(controller?.signal);}catch(error){lifeSignal?.removeEventListener('abort',cancel);controller?.abort();if(lifeSignal?.aborted)fail('E_PA_CURVE_CANCELLED','Curve initialization cancelled');throw error;}
 const available=()=>{if(lifeSignal?.aborted)fail('E_PA_CURVE_CANCELLED','Curve session cancelled');if(closed)fail('E_PA_CURVE_CLOSED','Curve session is closed');};
 const contours:{length:number;closed:boolean;segments:number;allocatedAccuracy:number}[]=[];
 try{
  available();await kernel.begin();let values:number[]=[];const flush=async()=>{available();if(values.length){await kernel.append(new Float64Array(values));values=[];}};
  for(const c of path.commands){
   if(c.op==='Z')values.push(5);else if(c.op==='M'||c.op==='L')values.push(c.op==='M'?1:2,c.point.x,c.point.y);else if(c.op==='Q')values.push(3,c.control.x,c.control.y,c.point.x,c.point.y);else if(c.op==='C')values.push(4,c.control1.x,c.control1.y,c.control2.x,c.control2.y,c.point.x,c.point.y);
   if(values.length>=4096)await flush();
  }
  await flush();const count=await kernel.prepare(accuracy);if(!Number.isSafeInteger(count)||count<1)fail('E_PA_CURVE_OUTPUT','Invalid contour count');
  for(let i=0;i<count;i++){available();const row=await kernel.contour_info(i);if(!(row instanceof Float64Array)||row.length!==4||row.some(n=>!Number.isFinite(n))||row[0]<0||![0,1].includes(row[1])||!Number.isSafeInteger(row[2])||row[2]<0||row[3]<0)fail('E_PA_CURVE_OUTPUT','Invalid metric record');contours.push(Object.freeze({length:row[0],closed:Boolean(row[1]),segments:row[2],allocatedAccuracy:row[3]}));}
  available();
 }catch(error){try{await kernel.dispose();}catch(cleanup){throw new EngineError('E_PA_CURVE_CLEANUP','Curve initialization and cleanup failed',{details:{original:diagnostic(error),cleanup:diagnostic(cleanup)}});}finally{controller?.abort();lifeSignal?.removeEventListener('abort',cancel);}if(lifeSignal?.aborted)fail('E_PA_CURVE_CANCELLED','Curve initialization cancelled');throw error;}
 const metrics=Object.freeze({accuracy,contours:Object.freeze(contours)});
 async function* sampleStream(distances:Iterable<number>,query:CurveQueryOptions={}):AsyncGenerator<CurveSample>{
  available();if(query.signal?.aborted)fail('E_PA_CURVE_CANCELLED','Curve query cancelled');if(busy)fail('E_PA_CURVE_BUSY','Await or close the current curve query iterator');
  const contour=query.contour??(contours.length===1?0:undefined),boundary=query.boundary??'error',side=query.side??'outgoing';
  if(contour===undefined||!Number.isInteger(contour)||contour<0||contour>=contours.length)fail('E_PA_CURVE_CONTOUR','Choose one existing contour explicitly for multi-contour paths');
  if(!['error','clamp','wrap'].includes(boundary)||!['incoming','outgoing'].includes(side))fail('E_PA_CURVE_PARAMETER','Known boundary and join-side rules required');
  const metric=contours[contour];if(boundary==='wrap'&&!metric.closed)fail('E_PA_CURVE_CLOSURE','Wrap requires a closed contour');
  if(!distances||typeof distances[Symbol.iterator]!=='function')fail('E_PA_CURVE_PARAMETER','Expected iterable physical distances');
  busy=true;query.signal?.addEventListener('abort',cancel,{once:true});const check=()=>{if(query.signal?.aborted)fail('E_PA_CURVE_CANCELLED','Curve query cancelled');available();};
  try{
   let batch:number[]=[];
   const decode=async(values:number[])=>{
    check();if(metric.length===0)fail('E_PA_CURVE_DEGENERATE','Cannot sample a zero-length contour');
    const row=await kernel.sample(contour,new Float64Array(values),side==='incoming'?0:1);check();
    if(!(row instanceof Float64Array)||row.length!==values.length*8||row.some(n=>!Number.isFinite(n)))fail('E_PA_CURVE_OUTPUT','Invalid sample chunk');
    return values.map((distance,i):CurveSample=>{const p=row.subarray(i*8,i*8+8),status=p[4];if(![0,1,2].includes(status)||!Number.isSafeInteger(p[5])||p[5]<0||p[5]>=metric.segments||p[6]<0||p[6]>1||p[7]!==distance)fail('E_PA_CURVE_OUTPUT','Invalid sample metadata');const norm=Math.hypot(p[2],p[3]);if(status===0?norm!==0:Math.abs(norm-1)>1e-12)fail('E_PA_CURVE_OUTPUT','Invalid tangent direction');return {x:p[0],y:p[1],distance,contour,segment:p[5],parameter:p[6],tangent:[p[2],p[3]],tangentStatus:status===0?'undefined':status===1?'derivative':'endpoint-limit',...status?{angleRadians:Math.atan2(p[3],p[2])}:{}};});
   };
   for(const input of distances){
    check();if(typeof input!=='number'||!Number.isFinite(input))fail('E_PA_CURVE_PARAMETER','Finite physical distance required');
    if(boundary==='error'&&(input<0||input>metric.length))fail('E_PA_CURVE_RANGE','Distance outside selected contour',{distance:input,length:metric.length,contour});
    const n=boundary==='clamp'?Math.max(0,Math.min(metric.length,input)):boundary==='wrap'&&metric.length>0?((input%metric.length)+metric.length)%metric.length:input;batch.push(n);
    if(batch.length===1024){for(const sample of await decode(batch))yield sample;batch=[];}
   }
   if(batch.length)for(const sample of await decode(batch))yield sample;
  }catch(error){if(query.signal?.aborted||lifeSignal?.aborted)fail('E_PA_CURVE_CANCELLED','Curve query cancelled');throw error;}finally{query.signal?.removeEventListener('abort',cancel);busy=false;}
 }
 return {
  coordinates:coordinates as Readonly<Coordinates2D>,metrics,sampleStream,
  async sampleBatch(distances:readonly number[],query:CurveQueryOptions={}){if(!Array.isArray(distances))fail('E_PA_CURVE_PARAMETER','Explicit array required for ordered batch queries');const result:CurveSample[]=[];for await(const sample of sampleStream(distances,query))result.push(sample);return result;},
  async sample(distance:number,query:CurveQueryOptions={}){const result:CurveSample[]=[];for await(const sample of sampleStream([distance],query))result.push(sample);return result[0];},
  async diagnostics(){return {busy,closed,...terminated?{termination:'Kit abort; Rust Drop unverified'}:{},...!closed?{kernel:await kernel.diagnostics()}:{}};},
  async dispose(){if(disposal)return disposal;if(busy)cancel();else closed=true;disposal=(async()=>{try{const result=await kernel.dispose();return terminated?{mode:'terminated' as const}:{mode:'cooperative' as const,remainingSessions:result.remainingSessions};}finally{controller?.abort();lifeSignal?.removeEventListener('abort',cancel);}})();return disposal;},
 };
}
