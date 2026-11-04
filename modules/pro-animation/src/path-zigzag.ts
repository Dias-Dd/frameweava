// SPDX-License-Identifier: Apache-2.0
// Existing Kit lifecycle + canonical geometry adapter; original EffectCraft Rust/kurbo owns sampling.
import {EngineError,diagnostic} from '../../../src/core/errors.ts';
import {evaluate} from '../../../src/core/animation.ts';
import type {Signal,FrameContext} from '../../../src/core/types.ts';
import type * as Graphics from '../../graphics-contracts/index.ts';
import type {PathData,PathCommand} from '../../graphics-contracts/types.ts';
export interface ZigzagKernel {
 begin():Promise<void>;append(values:Float64Array):Promise<void>;
 zigzag(size:number,ridges:number,smooth:boolean,accuracy:number,maxCommands:number):Promise<number>;
 metadata():Promise<Float64Array>;read_output(start:number,count:number):Promise<Float64Array>;reset():Promise<void>;
 diagnostics():Promise<unknown>;dispose():Promise<{remainingSessions:number}>;
}
export type ZigzagKernelFactory=(options:{signal:AbortSignal})=>Promise<ZigzagKernel>;
export interface ZigzagPathOptions {
 /** Signed physical normal displacement; size0 is exact source identity. Default10px. */
 size?:Signal<number>;
 /** Rounds halves away from zero like original Rust. Nonnegative; no silent ridge1000 clamp. Default10. */
 ridges?:Signal<number>;smooth?:boolean;
 /** Per-original-segment arclength/inverse budget in px. Default1e-4, not global accumulated error. */
 accuracy?:number;
 /** Optional tighter per-input output budget; existing Graphics canonical budget remains enforced. */
 maxOutputCommands?:number;signal?:AbortSignal;
}
function fail(code:string,message:string,details?:unknown):never{throw new EngineError(code,message,{details});}
const natural=(n:number)=>Number.isSafeInteger(n)&&n>=0;
/** Own one existing Kit client in Stage init. Large input lists can be consumed lazily. */
export async function createPathZigzag(graphics:Pick<typeof Graphics,'validatePathData'|'LIMITS'>,factory:ZigzagKernelFactory){
 const controller=new AbortController();let kernel:ZigzagKernel;try{kernel=await factory({signal:controller.signal});}catch(error){controller.abort();throw error;}let busy=false,closed=false,terminated=false,disposal:Promise<{mode:'cooperative';remainingSessions:number}|{mode:'terminated'}>|undefined;
 const cancel=()=>{closed=true;terminated=true;controller.abort();};
 const available=()=>{if(closed)fail('E_PA_ZIGZAG_CLOSED','Zig Zag client is closed');};
 const scalar=(s:Signal<number>,ctx:FrameContext|undefined,name:string)=>{if(typeof s!=='number'&&!ctx)fail('E_PA_ZIGZAG_CONTEXT','A FrameContext is required for Signals');const n=typeof s==='number'?s:evaluate(s,ctx!);if(typeof n!=='number'||!Number.isFinite(n))fail('E_PA_ZIGZAG_PARAMETER',`${name} must be finite`);return n;};
 async function* solve(inputs:Iterable<PathData>,p:ZigzagPathOptions={},context?:FrameContext):AsyncGenerator<PathData>{
  available();if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).some(k=>!['size','ridges','smooth','accuracy','maxOutputCommands','signal'].includes(k)))fail('E_PA_ZIGZAG_PARAMETER','Use documented path modifier options');
  const {signal}=p;if(signal?.aborted)fail('E_PA_ZIGZAG_CANCELLED','Zig Zag operation cancelled');if(busy)fail('E_PA_ZIGZAG_BUSY','Await or close the current Zig Zag iterator');
  const size=scalar(p.size??10,context,'size'),ridges=scalar(p.ridges??10,context,'ridges'),smooth=p.smooth??false,accuracy=p.accuracy??1e-4,requested=p.maxOutputCommands,limit=Math.min(requested??graphics.LIMITS.commands,graphics.LIMITS.commands);
  if(ridges<0||typeof smooth!=='boolean'||!Number.isFinite(accuracy)||accuracy<=0||requested!==undefined&&(!natural(requested)||requested<1||requested>0xffffffff))fail('E_PA_ZIGZAG_PARAMETER','Nonnegative ridges, boolean smooth, positive finite accuracy and optional uint32 budget required');
  if(!inputs||typeof inputs[Symbol.iterator]!=='function')fail('E_PA_ZIGZAG_INPUT','Expected an iterable of canonical paths');
  const check=()=>{if(signal?.aborted)fail('E_PA_ZIGZAG_CANCELLED','Zig Zag operation cancelled');available();};
  busy=true;signal?.addEventListener('abort',cancel,{once:true});let initialized=false,failure:unknown,sequence=0;
  try{for(const input of inputs){
   check();const path=graphics.validatePathData(input);if(path.coordinates.unit!=='px')fail('E_PA_ZIGZAG_SPACE','Path sizes/accuracy use declared physical pixels');
   if(size===0||path.commands.length===0){if(path.commands.length>limit)fail('E_PA_ZIGZAG_BUDGET','Caller output budget exhausted');yield path;continue;}
   await kernel.begin();initialized=true;let chunk:number[]=[];
   const flush=async()=>{check();if(chunk.length){await kernel.append(new Float64Array(chunk));chunk=[];}};
   for(const c of path.commands){if(c.op==='Z')chunk.push(5);else if(c.op==='M'||c.op==='L')chunk.push(c.op==='M'?1:2,c.point.x,c.point.y);else if(c.op==='Q')chunk.push(3,c.control.x,c.control.y,c.point.x,c.point.y);else if(c.op==='C')chunk.push(4,c.control1.x,c.control1.y,c.control2.x,c.control2.y,c.point.x,c.point.y);if(chunk.length>=4096)await flush();}
   await flush();check();let count:number;
   try{count=await kernel.zigzag(size,ridges,smooth,accuracy,limit);}catch(error){check();const original=diagnostic(error),match=original.message.match(/\bE_PA_ZIGZAG_(?:PARAMETER|INPUT|RANGE|BUDGET|PRECISION|MEMORY|OUTPUT|STATE)\b/);throw new EngineError(match?.[0]??'E_PA_ZIGZAG_KERNEL','Zig Zag geometry computation failed',{details:{original,limit,limitSource:requested!==undefined&&requested<graphics.LIMITS.commands?'caller':'graphics.commands'}});}check();
   const meta=await kernel.metadata();if(!natural(count)||count>limit||!(meta instanceof Float64Array)||meta.length!==3||meta.some(n=>!natural(n))||meta[0]!==count||meta[1]<count||meta[1]>count*7||meta[2]>count)fail('E_PA_ZIGZAG_OUTPUT','Invalid kernel result metadata');
   const values:number[]=[];for(let at=0;at<meta[1];at+=4096){check();const n=Math.min(4096,meta[1]-at),part=await kernel.read_output(at,n);if(!(part instanceof Float64Array)||part.length!==n||part.some(n=>!Number.isFinite(n)))fail('E_PA_ZIGZAG_OUTPUT','Invalid finite geometry chunk');for(const v of part)values.push(v);}
   let at=0,id=0;const commands:PathCommand[]=[],point=()=>{if(at+2>values.length)fail('E_PA_ZIGZAG_OUTPUT','Truncated point');return {id:'zigzag.p.'+id++,x:values[at++],y:values[at++]};};
   while(at<values.length){const op=values[at++];if(op===1||op===2)commands.push({op:op===1?'M':'L',point:point()});else if(op===3)commands.push({op:'Q',control:point(),point:point()});else if(op===4)commands.push({op:'C',control1:point(),control2:point(),point:point()});else if(op===5)commands.push({op:'Z'});else fail('E_PA_ZIGZAG_OUTPUT','Unknown output command');}
   if(commands.length!==count)fail('E_PA_ZIGZAG_OUTPUT','Output command count differs from metadata');const result=graphics.validatePathData({...path,id:path.id+'.zigzag.'+sequence++,commands});
   check();await kernel.reset();initialized=false;check();yield result;
  }}catch(error){failure=error;if(signal?.aborted)fail('E_PA_ZIGZAG_CANCELLED','Zig Zag operation cancelled');throw error;}
  finally{try{if(initialized&&!terminated)await kernel.reset();}catch(cleanup){cancel();throw new EngineError('E_PA_ZIGZAG_CLEANUP','Geometry operation cleanup failed',{details:{original:failure===undefined?null:diagnostic(failure),cleanup:diagnostic(cleanup)}});}finally{signal?.removeEventListener('abort',cancel);busy=false;}}
 }
 return {zigzagPathsStream:solve,async zigzagPaths(inputs:Iterable<PathData>,p:ZigzagPathOptions={},context?:FrameContext){const result:PathData[]=[];for await(const path of solve(inputs,p,context))result.push(path);return result;},async diagnostics(){return {closed,busy,terminated,...closed?{}:{kernel:await kernel.diagnostics()}};},dispose(){return disposal??=(async()=>{if(busy)cancel();closed=true;if(terminated)return {mode:'terminated' as const};try{const result=await kernel.dispose();if(!natural(result.remainingSessions))fail('E_PA_ZIGZAG_CLEANUP','Invalid cleanup result');return {mode:'cooperative' as const,remainingSessions:result.remainingSessions};}catch(error){terminated=true;throw new EngineError('E_PA_ZIGZAG_CLEANUP','Owned geometry client cleanup failed',{details:{cleanup:diagnostic(error)}});}finally{controller.abort();}})();}};
}
