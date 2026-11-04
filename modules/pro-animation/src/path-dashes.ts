// SPDX-License-Identifier: Apache-2.0
// Thin canonical geometry adapter to unchanged kurbo::dash. No renderer or time model.
import {EngineError,diagnostic} from '../../../src/core/errors.ts';
import {evaluate} from '../../../src/core/animation.ts';
import type {FrameContext,Signal} from '../../../src/core/types.ts';
import type {PathData,PathCommand} from '../../graphics-contracts/types.ts';
import type * as Graphics from '../../graphics-contracts/index.ts';
export interface DashKernel {
 begin():Promise<void>;append(values:Float64Array):Promise<void>;
 dash(pattern:Float64Array,offset:number,maxCommands:number):Promise<number>;
 contour_size(index:number):Promise<number>;read_contour(index:number,start:number,count:number):Promise<Float64Array>;
 reset():Promise<void>;diagnostics():Promise<unknown>;dispose():Promise<{remainingSessions:number}>;
}
export type DashKernelFactory=(options:{signal:AbortSignal})=>Promise<DashKernel>;
export interface DashPathOptions {
 /** Physical px alternating on/off lengths. Odd arrays repeat twice. Empty means solid. Zeros are explicitly unsupported. */
 pattern:readonly Signal<number>[];
 /** Physical px consumed from the pattern at the contour origin. Positive advances into the pattern. */
 offset?:Signal<number>;
 signal?:AbortSignal;
 /** Optional per-input-path resource budget; no default command-count cap is added. */
 maxOutputCommands?:number;
}
function fail(code:string,message:string,details?:unknown):never {throw new EngineError(code,message,{details});}
/** Own one reviewed Kit client in Stage init, reuse it for random-access frames, dispose with the Stage. */
export async function createPathDasher(graphics:Pick<typeof Graphics,'validatePathData'|'LIMITS'>,factory:DashKernelFactory){
 const controller=new AbortController(),kernel=await factory({signal:controller.signal});
 let busy=false,closed=false,terminated=false,disposal:Promise<{mode:'cooperative'|'terminated';remainingSessions?:number}>|undefined;
 const available=()=>{if(closed)fail('E_PA_DASH_CLOSED','Dash session is closed');};
 const cancel=()=>{closed=true;terminated=true;controller.abort();};
 const number=(s:Signal<number>,ctx:FrameContext|undefined,name:string)=>{if(typeof s!=='number'&&!ctx)fail('E_PA_DASH_CONTEXT','A FrameContext is required for dash Signals');const n=typeof s==='number'?s:evaluate(s,ctx!);if(typeof n!=='number'||!Number.isFinite(n))fail('E_PA_DASH_PARAMETER',`${name} must be finite`);return n;};
 async function* solve(inputs:Iterable<PathData>,options:DashPathOptions,context?:FrameContext):AsyncGenerator<PathData>{
  available();options.signal?.throwIfAborted();if(busy)fail('E_PA_DASH_BUSY','Await or close the current dash iterator');
  if(!Array.isArray(options.pattern))fail('E_PA_DASH_PARAMETER','Explicit dash pattern array required');
  const pattern=options.pattern.map(s=>number(s,context,'pattern')),offset=number(options.offset??0,context,'offset'),sum=pattern.reduce((a,b)=>a+b,0),period=sum*(pattern.length%2?2:1),limit=options.maxOutputCommands??0;
  if(pattern.some(n=>n<=0)||!Number.isFinite(period)||pattern.length&&period<=0)fail('E_PA_DASH_PARAMETER','Pattern lengths must be positive and have a finite period; zero-length dot dashes are not provided');
  if(options.maxOutputCommands!==undefined&&(!Number.isSafeInteger(limit)||limit<1||limit>0xffffffff))fail('E_PA_DASH_PARAMETER','Optional WASM32 output command budget must be a positive uint32');
  if(!inputs||typeof inputs[Symbol.iterator]!=='function')fail('E_PA_DASH_INPUT','Expected an iterable of canonical paths');
  busy=true;options.signal?.addEventListener('abort',cancel,{once:true});let initialized=false,failure:unknown,sequence=0;
  const check=()=>{options.signal?.throwIfAborted();available();};
  try{for(const input of inputs){
   check();const path=graphics.validatePathData(input);if(path.coordinates.unit!=='px')fail('E_PA_DASH_SPACE','Dash lengths use explicit pixel coordinates');
   if(!pattern.length){if(limit&&path.commands.length>limit)fail('E_PA_DASH_BUDGET','Caller output command budget exhausted');yield path;continue;}
   await kernel.begin();initialized=true;let chunk:number[]=[];
   const flush=async()=>{check();if(chunk.length){await kernel.append(new Float64Array(chunk));chunk=[];}};
   for(const c of path.commands){
    if(c.op==='Z')chunk.push(5);else if(c.op==='M'||c.op==='L')chunk.push(c.op==='M'?1:2,c.point.x,c.point.y);else if(c.op==='Q')chunk.push(3,c.control.x,c.control.y,c.point.x,c.point.y);else if(c.op==='C')chunk.push(4,c.control1.x,c.control1.y,c.control2.x,c.control2.y,c.point.x,c.point.y);
    if(chunk.length>=4096)await flush();
   }
   await flush();check();const count=await kernel.dash(new Float64Array(pattern),offset,limit);
   if(!Number.isSafeInteger(count)||count<0)fail('E_PA_DASH_OUTPUT','Invalid result count');
   for(let i=0;i<count;i++){
    check();const length=await kernel.contour_size(i);if(!Number.isSafeInteger(length)||length<0)fail('E_PA_DASH_OUTPUT','Invalid contour length');
    const raw:number[]=[];for(let start=0;start<length;start+=4096){check();const n=Math.min(4096,length-start),data=await kernel.read_contour(i,start,n);if(!(data instanceof Float64Array)||data.length!==n||data.some(v=>!Number.isFinite(v)))fail('E_PA_DASH_OUTPUT','Invalid contour chunk');raw.push(...data);}
    const commands:PathCommand[]=[];let at=0,pointIndex=0,closedAt:{x:number;y:number}|undefined,origin:{x:number;y:number}|undefined;
    const point=()=>{if(at+2>raw.length)fail('E_PA_DASH_OUTPUT','Truncated curve result');return {id:`dash.${sequence}.${pointIndex++}`,x:raw[at++],y:raw[at++]};};
    while(at<raw.length){
     if(commands.length>=graphics.LIMITS.commands)fail('E_GRAPHICS_LIMIT','One dash contour exceeds the existing PathData command budget');const op=raw[at++];
     // The pinned iterator can emit ClosePath followed by an exact zero-length
     // closing LineTo. Remove that redundant edge only; never round coordinates.
     if(closedAt&&op!==1){if(op===2){const p=point();if(p.x===closedAt.x&&p.y===closedAt.y)continue;}fail('E_PA_DASH_OUTPUT','Nonredundant command after a closed contour');}
     if(op===1||op===2){const p=point();if(op===1){origin=p;closedAt=undefined;}commands.push({op:op===1?'M':'L',point:p});}
     else if(op===3)commands.push({op:'Q',control:point(),point:point()});else if(op===4)commands.push({op:'C',control1:point(),control2:point(),point:point()});else if(op===5){commands.push({op:'Z'});closedAt=origin;}else fail('E_PA_DASH_OUTPUT','Unknown curve command');
    }
    // Move-only stashes carry no drawable geometry; do not invent a dot cap.
    if(commands.some(c=>c.op==='L'||c.op==='Q'||c.op==='C'))yield graphics.validatePathData({...path,id:`${path.id}.dash.${sequence++}`,commands});
   }
   await kernel.reset();initialized=false;
  }}catch(error){failure=error;throw error;}finally{
   options.signal?.removeEventListener('abort',cancel);
   try{if(initialized&&!closed)await kernel.reset();}catch(cleanup){cancel();throw new EngineError('E_PA_DASH_CLEANUP','Dash cleanup failed; owned client terminated',{details:{...(failure?{original:diagnostic(failure)}:{}),cleanup:diagnostic(cleanup)}});}finally{busy=false;}
  }
 }
 return {
  dashPathsStream:solve,
  async dashPaths(inputs:Iterable<PathData>,options:DashPathOptions,context?:FrameContext){const paths:PathData[]=[];for await(const path of solve(inputs,options,context))paths.push(path);return paths;},
  async diagnostics(){return {busy,closed,...terminated?{termination:'Kit abort; Rust Drop unverified'}:{kernel:await kernel.diagnostics()}};},
  async dispose(){if(disposal)return disposal;if(busy)cancel();else closed=true;disposal=(async()=>{try{const result=await kernel.dispose();return terminated?{mode:'terminated' as const}:{mode:'cooperative' as const,remainingSessions:result.remainingSessions};}finally{controller.abort();}})();return disposal;},
 };
}
