// SPDX-License-Identifier: Apache-2.0
// PathData/Signal adapter only. Boolean and offset kernels run unchanged Clipper2 Rust in WASM.
import {EngineError,diagnostic} from '../../../src/core/errors.ts';
import {evaluate} from '../../../src/core/animation.ts';
import type {FrameContext,Signal,Diagnostic} from '../../../src/core/types.ts';
import type {PathData,PathCommand,PathPoint} from '../../graphics-contracts/types.ts';
import type * as Graphics from '../../graphics-contracts/index.ts';
import {splitCubic,lerpPoint,type Cubic,type XY} from './geometry.ts';

/** Existing Kit generated Api satisfies this interface; no Worker path, pointer or custom host ABI is exposed. */
export interface PathOpsKernel {
  begin(grid:number,x:number,y:number):Promise<void>;
  append(values:Float64Array,finish:boolean):Promise<void>;
  finish_operand(rule:number):Promise<void>;
  boolean(operation:number):Promise<number>;
  offset(distance:number,join:number,miter:number,arcTolerance:number):Promise<number>;
  /** Optional for older reviewed factories. Stroke APIs fail explicitly if these are absent. */
  finish_stroke_contour?(closed:boolean):Promise<void>;
  stroke?(width:number,cap:number,join:number,miter:number,arcTolerance:number):Promise<number>;
  face_info(face:number):Promise<Float64Array>;
  read_contour(face:number,contour:number,start:number,count:number):Promise<Float64Array>;
  input_points():Promise<number>;
  collapsed_contours():Promise<number>;
  reset():Promise<void>;
  diagnostics():Promise<unknown>;
  dispose():Promise<{remainingSessions:number}>;
}
export type PathOpsKernelFactory=(options:{signal:AbortSignal})=>Promise<PathOpsKernel>;
export type PathOperands=Iterable<PathData>;
export interface PathOperationOptions {
  /** Physical px curve-flattening tolerance; not a topology/Hausdorff certificate for Boolean results. */
  tolerance?:number;
  /** Explicit integer grid spacing in px; defaults tolerance/8, never silently coarsened. */
  gridSize?:number;
  /** Match filled SVG/Canvas geometry by default. Reject is available for accidental open strokes. */
  openContours?:'close'|'reject';
  signal?:AbortSignal;
  onDiagnostic?:(diagnostic:Diagnostic)=>void;
}
export interface BooleanPathOptions extends PathOperationOptions {operation:'union'|'intersection'|'subtract'|'xor'}
export interface OffsetPathOptions extends PathOperationOptions {
  distance:Signal<number>;
  join?:'miter'|'round'|'bevel'|'square';
  miterLimit?:number;
  arcTolerance?:number;
}
export interface StrokePathOptions extends Omit<PathOperationOptions,'openContours'> {
  width:Signal<number>;
  cap?:'butt'|'round'|'square';
  join?:'miter'|'round'|'bevel'|'square';
  miterLimit?:number;
  arcTolerance?:number;
}
function fail(code:string,message:string,details?:unknown):never{throw new EngineError(code,message,{details});}
const positive=(n:number,name:string)=>{
  if(!Number.isFinite(n)||n<=0)fail('E_PA_PATHOPS_PARAMETER',`${name} must be finite and positive`,{parameter:name});return n;
};
const value=(v:Signal<number>,ctx:FrameContext|undefined)=>{
  if(typeof v!=='number'&&!ctx)fail('E_PA_PATHOPS_CONTEXT','A FrameContext is required to evaluate a distance Signal');
  const n=typeof v==='number'?v:evaluate(v,ctx!);if(!Number.isFinite(n))fail('E_PA_PATHOPS_PARAMETER','distance must be finite');return n as number;
};
const same=(a:XY,b:XY)=>a[0]===b[0]&&a[1]===b[1];
const point=(p:PathPoint):XY=>[p.x,p.y];
function distanceToSegment(p:XY,a:XY,b:XY):number {
  const x=b[0]-a[0],y=b[1]-a[1],square=x*x+y*y,t=square?Math.max(0,Math.min(1,((p[0]-a[0])*x+(p[1]-a[1])*y)/square)):0;
  return Math.hypot(p[0]-a[0]-t*x,p[1]-a[1]-t*y);
}
/** Convex-hull distance to the finite chord handles collinear backtracking as well as ordinary curves. */
function* flattened(curve:Cubic,tolerance:number,check:()=>void):Generator<XY>{
  const stack:Cubic[]=[curve];
  while(stack.length){
    check();const c=stack.pop()!,error=Math.max(distanceToSegment(c[1],c[0],c[3]),distanceToSegment(c[2],c[0],c[3]));
    if(error<=tolerance){yield c[3];continue;}
    let magnitude=0;for(const p of c)magnitude=Math.max(magnitude,Math.abs(p[0]),Math.abs(p[1]));
    if(tolerance<Math.max(Number.MIN_VALUE,Number.EPSILON*magnitude*8))fail('E_PA_PATHOPS_ACCURACY','Requested curve tolerance is below Float64 coordinate resolution');
    const [a,b]=splitCubic(c,.5);
    if(a.every((p,i)=>same(p,c[i]))||b.every((p,i)=>same(p,c[i])))fail('E_PA_PATHOPS_ACCURACY','Curve subdivision reached Float64 resolution');
    stack.push(b,a);
  }
}

/** One owned, reusable official Kit client per Stage. Main supplies its reviewed R1 loader factory. */
export function createPathOperations(graphics:Pick<typeof Graphics,'validatePathData'|'LIMITS'>,factory:PathOpsKernelFactory){return pathOperationSession(graphics,factory);}
/** Transfer one already verified direct Kit kernel; no new host, Worker or cancellation shim. */
export function createPathOperationsFromKernel(graphics:Pick<typeof Graphics,'validatePathData'|'LIMITS'>,kernel:PathOpsKernel){return pathOperationSession(graphics,undefined,kernel);}
async function pathOperationSession(graphics:Pick<typeof Graphics,'validatePathData'|'LIMITS'>,factory:PathOpsKernelFactory|undefined,ownedKernel?:PathOpsKernel){
  const controller=factory?new AbortController():undefined,kernel=ownedKernel??await factory!({signal:controller!.signal});
  let busy=false,dead=false,terminated=false,disposal:Promise<{mode:'cooperative'|'terminated';remainingSessions?:number}>|undefined;
  let last: {operation:string;faces:number;inputPoints:number;collapsedContours:number}|undefined;
  const available=()=>{if(dead)fail('E_PA_PATHOPS_DISPOSED','Geometry session is closed; create a fresh Stage/session');};
  const cancel=()=>{if(!dead){dead=true;terminated=Boolean(controller);controller?.abort();}};
  async function* solve(inputs:PathOperands,options:BooleanPathOptions|OffsetPathOptions|StrokePathOptions,ctx?:FrameContext):AsyncGenerator<PathData>{
    available();options.signal?.throwIfAborted();
    if(busy)fail('E_PA_PATHOPS_BUSY','Await or close the current geometry result iterator before starting another solve');
    const tolerance=positive(options.tolerance??.01,'tolerance'),grid=positive(options.gridSize??tolerance/8,'gridSize'),open=('openContours' in options?options.openContours:undefined)??'close';
    if(!['close','reject'].includes(open))fail('E_PA_PATHOPS_PARAMETER','openContours must be close or reject');
    const isStroke='width' in options,isOffset='distance' in options,operation=isStroke?'stroke':isOffset?'offset':options.operation,operations={union:0,intersection:1,subtract:2,xor:3};
    if(!isOffset&&!isStroke&&!Object.hasOwn(operations,operation))fail('E_PA_PATHOPS_PARAMETER','Unknown boolean operation');
    if(isStroke&&(!kernel.stroke||!kernel.finish_stroke_contour))fail('E_PA_PATHOPS_CAPABILITY','This reviewed kernel does not provide stroke outlines; load the extended frozen profile');
    const distance=isOffset?value(options.distance,ctx):isStroke?value(options.width,ctx):0,joins={miter:0,round:1,bevel:2,square:3},join=isOffset||isStroke?options.join??'miter':'miter',miter=isOffset||isStroke?positive(options.miterLimit??2,'miterLimit'):2,arc=isOffset||isStroke?positive(options.arcTolerance??tolerance/4,'arcTolerance'):tolerance/4,caps={butt:0,round:1,square:2},cap=isStroke?options.cap??'butt':'butt';
    if(!Object.hasOwn(caps,cap)||isStroke&&distance<0)fail('E_PA_PATHOPS_PARAMETER','Known cap and nonnegative stroke width required');
    if(!Object.hasOwn(joins,join)||miter<1)fail('E_PA_PATHOPS_PARAMETER','Known join and miterLimit>=1 required');
    busy=true;options.signal?.addEventListener('abort',cancel,{once:true});
    let coordinates:PathData['coordinates']|undefined,count=0,initialized=false;
    const check=()=>{options.signal?.throwIfAborted();available();};
    let failure:unknown;
    try{
      check();
      if(!inputs||typeof inputs[Symbol.iterator]!=='function')fail('E_PA_PATHOPS_INPUT','Expected an iterable of canonical PathData operands');
      for(const input of inputs){
        check();const path=graphics.validatePathData(input);
        if(path.coordinates.unit!=='px')fail('E_PA_PATHOPS_SPACE','Path operations require explicit pixel units');
        if(!coordinates)coordinates=path.coordinates;
        else if(Object.keys(coordinates).some(k=>Reflect.get(coordinates!,k)!==Reflect.get(path.coordinates,k)))fail('E_PA_PATHOPS_SPACE','Operands must have identical coordinate spaces and dimensions');
        if(!initialized){const first=path.commands[0];if(first.op!=='M')fail('E_PA_PATHOPS_INPUT','Path must start with M');await kernel.begin(grid,first.point.x,first.point.y);initialized=true;}
        let buffer:number[]=[],active=false,at:XY=[0,0],start:XY=[0,0];
        const flush=async(finish:boolean)=>{check();await kernel.append(new Float64Array(buffer),finish);buffer=[];};
        const push=async(p:XY)=>{buffer.push(...p);if(buffer.length>=4096)await flush(false);};
        const finish=async(closed=false)=>{if(active){await flush(!isStroke);if(isStroke)await kernel.finish_stroke_contour!(closed);active=false;}};
        for(const c of path.commands){
          check();
          if(c.op==='M'){
            if(active&&!isStroke&&open==='reject')fail('E_PA_PATHOPS_CLOSURE','Open contour in a filled operation; close it or request openContours: close');
            await finish();active=true;at=start=point(c.point);await push(at);continue;
          }
          if(c.op==='Z'){await finish(true);at=start;continue;}
          const to=point(c.point);
          if(c.op==='L')await push(to);
          else if(c.op==='Q'||c.op==='C'){
            const curve:Cubic=c.op==='Q'?[at,lerpPoint(at,point(c.control),2/3),lerpPoint(to,point(c.control),2/3),to]:[at,point(c.control1),point(c.control2),to];
            for(const p of flattened(curve,tolerance,check))await push(p);
          }
          at=to;
        }
        if(active&&!isStroke&&open==='reject')fail('E_PA_PATHOPS_CLOSURE','Open final contour in a filled operation');
        await finish();if(!isStroke)await kernel.finish_operand(path.fillRule==='evenodd'?1:0);count++;
      }
      if(!count){last={operation,faces:0,inputPoints:0,collapsedContours:0};return;}
      const collapsed=await kernel.collapsed_contours();
      if(collapsed)options.onDiagnostic?.({code:'W_PA_PATHOPS_GRID_COLLAPSE',severity:'warning',message:'Degenerate or sub-grid contours have fewer than the required distinct quantized vertices',details:{contours:collapsed,gridSize:grid,tolerance}});
      check();const faces=isStroke?await kernel.stroke!(distance,caps[cap],joins[join],miter,arc):isOffset?await kernel.offset(distance,joins[join],miter,arc):await kernel.boolean(operations[operation as keyof typeof operations]);
      if(!Number.isSafeInteger(faces)||faces<0)fail('E_PA_PATHOPS_OUTPUT','Kernel returned an invalid face count');
      last={operation,faces,inputPoints:await kernel.input_points(),collapsedContours:collapsed};
      for(let face=0;face<faces;face++){
        check();const sizes=await kernel.face_info(face);let needed=0;
        for(const n of sizes){if(!Number.isSafeInteger(n)||n<3)fail('E_PA_PATHOPS_OUTPUT','Kernel returned an invalid contour size');needed+=n+1;}
        if(needed>graphics.LIMITS.commands)fail('E_GRAPHICS_LIMIT','One solid face exceeds the existing PathData command safety policy',{face,commands:needed,limit:graphics.LIMITS.commands});
        const commands:PathCommand[]=[];let id=0;
        for(let contour=0;contour<sizes.length;contour++){
          for(let from=0;from<sizes[contour];from+=2048){
            check();const n=Math.min(2048,sizes[contour]-from),data=await kernel.read_contour(face,contour,from,n);
            if(!(data instanceof Float64Array)||data.length!==n*2)fail('E_PA_PATHOPS_OUTPUT','Kernel returned an invalid coordinate chunk');
            for(let i=0;i<n;i++)commands.push({op:from+i?'L':'M',point:{id:'po.'+(id++).toString(36),x:data[i*2],y:data[i*2+1]}});
          }
          commands.push({op:'Z'});
        }
        yield graphics.validatePathData({schema:'frameweave.path',version:1,id:'pathops.'+face,coordinates,fillRule:'nonzero',commands});
      }
    }catch(error){failure=error;throw error;}finally{
      options.signal?.removeEventListener('abort',cancel);
      try{if(initialized&&!dead)await kernel.reset();}catch(error){
        cancel();throw new EngineError('E_PA_PATHOPS_CLEANUP','Geometry cleanup failed; the owned session was terminated',{details:{...(failure?{original:diagnostic(failure)}:{}),cleanup:diagnostic(error)}});
      }finally{busy=false;}
    }
  }
  async function collect(stream:AsyncIterable<PathData>):Promise<PathData[]>{const result:PathData[]=[];for await(const path of stream)result.push(path);return result;}
  return {
    booleanPaths(inputs:PathOperands,options:BooleanPathOptions,ctx?:FrameContext):Promise<PathData[]>{return collect(solve(inputs,options,ctx));},
    booleanPathsStream(inputs:PathOperands,options:BooleanPathOptions,ctx?:FrameContext):AsyncGenerator<PathData>{return solve(inputs,options,ctx);},
    offsetPaths(inputs:PathOperands,options:OffsetPathOptions,ctx?:FrameContext):Promise<PathData[]>{return collect(solve(inputs,options,ctx));},
    offsetPathsStream(inputs:PathOperands,options:OffsetPathOptions,ctx?:FrameContext):AsyncGenerator<PathData>{return solve(inputs,options,ctx);},
    strokePaths(inputs:PathOperands,options:StrokePathOptions,ctx?:FrameContext):Promise<PathData[]>{return collect(solve(inputs,options,ctx));},
    strokePathsStream(inputs:PathOperands,options:StrokePathOptions,ctx?:FrameContext):AsyncGenerator<PathData>{return solve(inputs,options,ctx);},
    async diagnostics(){return {...last?{lastOperation:last}:{},busy,closed:dead,...terminated?{termination:'existing Kit abort; Rust Drop unverified'}:{},...!dead?{kernel:await kernel.diagnostics()}:{}};},
    async dispose(){
      if(disposal)return disposal;
      if(busy)cancel();else dead=true;
      disposal=(async()=>{
        try{const result=await kernel.dispose();return terminated?{mode:'terminated' as const}:{mode:'cooperative' as const,remainingSessions:result.remainingSessions};}
        finally{controller?.abort();}
      })();return disposal;
    },
  };
}
