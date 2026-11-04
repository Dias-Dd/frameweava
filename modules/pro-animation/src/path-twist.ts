// SPDX-License-Identifier: Apache-2.0
// Existing Kit lifecycle + canonical geometry; original radial map/Jacobian with bounded Rust subdivision.
import {EngineError,diagnostic} from '../../../src/core/errors.ts';
import {evaluate} from '../../../src/core/animation.ts';
import type {Signal,FrameContext} from '../../../src/core/types.ts';
import type * as Graphics from '../../graphics-contracts/index.ts';
import type {PathData,PathCommand} from '../../graphics-contracts/types.ts';
export interface TwistKernel {
 begin():Promise<void>;append(values:Float64Array):Promise<void>;
 twist(angleDegrees:number,centerX:number,centerY:number,radius:number,accuracy:number,maxCommands:number):Promise<number>;
 metadata():Promise<Float64Array>;read_output(start:number,count:number):Promise<Float64Array>;reset():Promise<void>;
 diagnostics():Promise<unknown>;dispose():Promise<{remainingSessions:number}>;
}
export type TwistKernelFactory=(options:{signal:AbortSignal})=>Promise<TwistKernel>;
export interface TwistPathOptions {
 /** Degrees at the explicit/automatic reference radius. Positive follows px x-right/y-down coordinates. */
 angleDegrees?:Signal<number>;
 /** Physical px; defaults to each input coordinate extent center, not an ambient document origin. */
 center?:readonly [Signal<number>,Signal<number>];
 /** Positive physical reference radius; default conservative control hull of this input. */
 radius?:Signal<number>;
 /** Paired-parameter geometric target in px, default1e-3; below numerical floor fails explicitly. */
 accuracy?:number;maxOutputCommands?:number;signal?:AbortSignal;
}
function fail(code:string,message:string,details?:unknown):never{throw new EngineError(code,message,{details});}
const natural=(n:number)=>Number.isSafeInteger(n)&&n>=0;
/** Own one existing Kit client in Stage init. Large input lists can be consumed lazily. */
export async function createPathTwist(graphics:Pick<typeof Graphics,'validatePathData'|'LIMITS'>,factory:TwistKernelFactory){
 const controller=new AbortController();let kernel:TwistKernel;try{kernel=await factory({signal:controller.signal});}catch(error){controller.abort();throw error;}let lastGeometry:Readonly<{sourceId:string;angleDegrees:number;center:readonly [number,number];radius:number;accuracy:number;errorBound:number;commands:number;subdivisions:number;enclosureLines:number}>|null=null;let busy=false,closed=false,terminated=false,disposal:Promise<{mode:'cooperative';remainingSessions:number}|{mode:'terminated'}>|undefined;
 const cancel=()=>{closed=true;terminated=true;controller.abort();};
 const available=()=>{if(closed)fail('E_PA_TWIST_CLOSED','Twist client is closed');};
 const scalar=(s:Signal<number>,ctx:FrameContext|undefined,name:string)=>{if(typeof s!=='number'&&!ctx)fail('E_PA_TWIST_CONTEXT','A FrameContext is required for Signals');const n=typeof s==='number'?s:evaluate(s,ctx!);if(typeof n!=='number'||!Number.isFinite(n))fail('E_PA_TWIST_PARAMETER',`${name} must be finite`);return n;};
 async function* solve(inputs:Iterable<PathData>,p:TwistPathOptions={},context?:FrameContext):AsyncGenerator<PathData>{
  available();if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).some(k=>!['angleDegrees','center','radius','accuracy','maxOutputCommands','signal'].includes(k)))fail('E_PA_TWIST_PARAMETER','Use documented path modifier options');
  const {signal}=p;if(signal?.aborted)fail('E_PA_TWIST_CANCELLED','Twist operation cancelled');if(busy)fail('E_PA_TWIST_BUSY','Await or close the current Twist iterator');
  const angle=scalar(p.angleDegrees??0,context,'angleDegrees'),radius=p.radius===undefined?0:scalar(p.radius,context,'radius'),accuracy=p.accuracy??1e-3,requested=p.maxOutputCommands,limit=Math.min(requested??graphics.LIMITS.commands,graphics.LIMITS.commands);
  if(p.center!==undefined&&(!Array.isArray(p.center)||p.center.length!==2))fail('E_PA_TWIST_PARAMETER','Center must have two physical coordinates');
  const center=p.center===undefined?undefined:[scalar(p.center[0],context,'center.x'),scalar(p.center[1],context,'center.y')] as const;
  if(p.radius!==undefined&&radius<=0||!Number.isFinite(accuracy)||accuracy<=0||requested!==undefined&&(!natural(requested)||requested<1||requested>0xffffffff))fail('E_PA_TWIST_PARAMETER','Positive finite accuracy/radius and optional uint32 budget required');
  if(!inputs||typeof inputs[Symbol.iterator]!=='function')fail('E_PA_TWIST_INPUT','Expected an iterable of canonical paths');
  const check=()=>{if(signal?.aborted)fail('E_PA_TWIST_CANCELLED','Twist operation cancelled');available();};
  lastGeometry=null;busy=true;signal?.addEventListener('abort',cancel,{once:true});let initialized=false,failure:unknown,sequence=0;
  try{for(const input of inputs){
   check();const path=graphics.validatePathData(input);if(path.coordinates.unit!=='px')fail('E_PA_TWIST_SPACE','Path sizes/accuracy use declared physical pixels');
   if(angle===0||path.commands.length===0){if(path.commands.length>limit)fail('E_PA_TWIST_BUDGET','Caller output budget exhausted');yield path;continue;}
   await kernel.begin();initialized=true;let chunk:number[]=[];
   const flush=async()=>{check();if(chunk.length){await kernel.append(new Float64Array(chunk));chunk=[];}};
   for(const c of path.commands){if(c.op==='Z')chunk.push(5);else if(c.op==='M'||c.op==='L')chunk.push(c.op==='M'?1:2,c.point.x,c.point.y);else if(c.op==='Q')chunk.push(3,c.control.x,c.control.y,c.point.x,c.point.y);else if(c.op==='C')chunk.push(4,c.control1.x,c.control1.y,c.control2.x,c.control2.y,c.point.x,c.point.y);if(chunk.length>=4096)await flush();}
   await flush();check();let count:number;
   try{count=await kernel.twist(angle,center?.[0]??path.coordinates.width/2,center?.[1]??path.coordinates.height/2,radius,accuracy,limit);}catch(error){check();const original=diagnostic(error),match=original.message.match(/\bE_PA_TWIST_(?:PARAMETER|INPUT|RANGE|BUDGET|PRECISION|MEMORY|OUTPUT|STATE)\b/);throw new EngineError(match?.[0]??'E_PA_TWIST_KERNEL','Twist geometry computation failed',{details:{original,limit,limitSource:requested!==undefined&&requested<graphics.LIMITS.commands?'caller':'graphics.commands'}});}check();
   const meta=await kernel.metadata();if(!natural(count)||count>limit||!(meta instanceof Float64Array)||meta.length!==6||meta.some(n=>!Number.isFinite(n)||n<0)||meta[0]!==count||!natural(meta[1])||meta[1]<count||meta[1]>count*7||meta[2]>accuracy||!natural(meta[4])||!natural(meta[5])||meta[5]>count)fail('E_PA_TWIST_OUTPUT','Invalid complete kernel result/accuracy metadata');
   const values:number[]=[];for(let at=0;at<meta[1];at+=4096){check();const n=Math.min(4096,meta[1]-at),part=await kernel.read_output(at,n);if(!(part instanceof Float64Array)||part.length!==n||part.some(n=>!Number.isFinite(n)))fail('E_PA_TWIST_OUTPUT','Invalid finite geometry chunk');for(const v of part)values.push(v);}
   let at=0,id=0;const commands:PathCommand[]=[],point=()=>{if(at+2>values.length)fail('E_PA_TWIST_OUTPUT','Truncated point');return {id:'twist.p.'+id++,x:values[at++],y:values[at++]};};
   while(at<values.length){const op=values[at++];if(op===1||op===2)commands.push({op:op===1?'M':'L',point:point()});else if(op===3)commands.push({op:'Q',control:point(),point:point()});else if(op===4)commands.push({op:'C',control1:point(),control2:point(),point:point()});else if(op===5)commands.push({op:'Z'});else fail('E_PA_TWIST_OUTPUT','Unknown output command');}
   if(commands.length!==count)fail('E_PA_TWIST_OUTPUT','Output command count differs from metadata');const result=graphics.validatePathData({...path,id:path.id+'.twist.'+sequence++,commands});
   check();await kernel.reset();initialized=false;check();lastGeometry=Object.freeze({sourceId:path.id,angleDegrees:angle,center:Object.freeze([center?.[0]??path.coordinates.width/2,center?.[1]??path.coordinates.height/2]) as readonly [number,number],radius:meta[3],accuracy,errorBound:meta[2],commands:count,subdivisions:meta[4],enclosureLines:meta[5]});yield result;
  }}catch(error){lastGeometry=null;failure=error;if(signal?.aborted)fail('E_PA_TWIST_CANCELLED','Twist operation cancelled');throw error;}
  finally{try{if(initialized&&!terminated)await kernel.reset();}catch(cleanup){cancel();throw new EngineError('E_PA_TWIST_CLEANUP','Geometry operation cleanup failed',{details:{original:failure===undefined?null:diagnostic(failure),cleanup:diagnostic(cleanup)}});}finally{signal?.removeEventListener('abort',cancel);busy=false;}}
 }
 return {twistPathsStream:solve,async twistPaths(inputs:Iterable<PathData>,p:TwistPathOptions={},context?:FrameContext){const result:PathData[]=[];for await(const path of solve(inputs,p,context))result.push(path);return result;},async diagnostics(){return {closed,busy,terminated,lastGeometry,...closed?{}:{kernel:await kernel.diagnostics()}};},dispose(){return disposal??=(async()=>{if(busy)cancel();closed=true;if(terminated)return {mode:'terminated' as const};try{const result=await kernel.dispose();if(!natural(result.remainingSessions))fail('E_PA_TWIST_CLEANUP','Invalid cleanup result');return {mode:'cooperative' as const,remainingSessions:result.remainingSessions};}catch(error){terminated=true;throw new EngineError('E_PA_TWIST_CLEANUP','Owned geometry client cleanup failed',{details:{cleanup:diagnostic(error)}});}finally{controller.abort();}})();}};
}
