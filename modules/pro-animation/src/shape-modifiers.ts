// Pucker/Bloat and Round Corners adapt EffectCraft crates/path/src/ops.rs
// @861c51f8187bf56efc77cc7b60fc4a513d2b7198, MIT selected.
// Copyright (c) 2026 ArtCraft Team and contributors. See vendor/effectcraft.
import {EngineError} from '../../../src/core/errors.ts';
import {evaluate} from '../../../src/core/animation.ts';
import type {FrameContext,Signal} from '../../../src/core/types.ts';
import type {PathData,PathCommand,PathPoint} from '../../graphics-contracts/types.ts';
import type * as Graphics from '../../graphics-contracts/index.ts';
import {splitCubic,cubicPart,lerpPoint,distance,lengthBounds,type XY,type Cubic} from './geometry.ts';

/** Optional caller resource budgets, not permanent geometry-size limits. Graphics' existing limits still apply. */
export interface ShapeWork {
  signal?:AbortSignal;
  maxCommands?:number;
  maxSubdivisionSteps?:number;
}
export interface RepeaterOptions extends ShapeWork {
  copies:Signal<number>;
  offset?:Signal<number>;
  position?:readonly [Signal<number>,Signal<number>];
  /** Radians per copy, clockwise in top-left/y-down coordinates. */
  rotation?:Signal<number>;
  /** Factors per copy, not percentages. */
  scale?:readonly [Signal<number>,Signal<number>];
  anchor?:readonly [Signal<number>,Signal<number>];
  startOpacity?:Signal<number>;
  endOpacity?:Signal<number>;
  order?:'forward'|'reverse';
}
/** A local TS instance record. PathData remains the only geometry wire format. */
export interface RepeatedPath {index:number;offset:number;opacity:number;path:PathData}
export interface PuckerBloatOptions extends ShapeWork {amount:Signal<number>}
export interface RoundCornersOptions extends ShapeWork {
  /** Upstream cutback distance along adjacent segments, px; clamped to half each adjacent length. */
  radius:Signal<number>;
  /** Absolute arc-length approximation budget, px. */
  tolerance?:number;
}
const fail=(code:string,message:string,details?:unknown):never=>{throw new EngineError(code,message,{details});};
const finite=(n:number,name:string)=>{
  if(!Number.isFinite(n))fail('E_PA_SHAPE_PARAMETER',`${name} must be finite`,{parameter:name});
  return n;
};
const scalar=(s:Signal<number>,context:FrameContext,name:string)=>finite(evaluate(s,context),name);
const xy=(p:PathPoint):XY=>[p.x,p.y];
const sub=(a:XY,b:XY):XY=>[a[0]-b[0],a[1]-b[1]];
const add=(a:XY,b:XY):XY=>[a[0]+b[0],a[1]+b[1]];
const mul=(p:XY,n:number):XY=>[p[0]*n,p[1]*n];
const unit=(p:XY):XY=>{const n=Math.hypot(...p);return n>0?mul(p,1/n):[0,0];};
const same=(a:XY,b:XY)=>a[0]===b[0]&&a[1]===b[1];
type Segment={curve:Cubic;kind:'L'|'Q'|'C'};
type Contour={start:XY;segments:Segment[];closed:boolean};

function work(options:ShapeWork){
  const {signal,maxCommands,maxSubdivisionSteps}=options;
  for(const [name,n]of [['maxCommands',options.maxCommands],['maxSubdivisionSteps',options.maxSubdivisionSteps]] as const)
    if(n!==undefined&&(!Number.isSafeInteger(n)||n<1))fail('E_PA_SHAPE_PARAMETER',`${name} must be a positive safe integer`);
  let steps=0;
  const check=()=>signal?.throwIfAborted();
  check();
  return {
    check,
    step(){check();if(maxSubdivisionSteps!==undefined&&++steps>maxSubdivisionSteps)fail('E_PA_SHAPE_BUDGET','Caller subdivision budget exhausted',{limit:maxSubdivisionSteps});},
    commands(n:number){check();if(maxCommands!==undefined&&n>maxCommands)fail('E_PA_SHAPE_BUDGET','Caller output command budget exhausted',{limit:maxCommands});},
  };
}
function points(command:PathCommand):PathPoint[]{
  if(command.op==='Z')return [];
  if(command.op==='C')return [command.control1,command.control2,command.point];
  return command.op==='Q'?[command.control,command.point]:[command.point];
}
function emitter(path:PathData,budget:ReturnType<typeof work>){
  const used=new Set(path.commands.flatMap(points).map(p=>p.id));let sequence=0;
  const point=(p:XY):PathPoint=>{let id:string;do{id='pa.shape.'+(sequence++).toString(36);}while(used.has(id));used.add(id);return {id,x:p[0],y:p[1]};};
  const commands:PathCommand[]=[];
  return {point,commands,push(command:PathCommand){budget.commands(commands.length+1);commands.push(command);}};
}
function contours(path:PathData,budget:ReturnType<typeof work>):Contour[]{
  const result:Contour[]=[];let current:Contour|undefined,at:XY=[0,0];
  const append=(curve:Cubic,kind:Segment['kind'])=>{if(!curve.every(p=>same(p,curve[0])))current!.segments.push({curve,kind});};
  for(const c of path.commands){
    budget.check();
    if(c.op==='M'){at=xy(c.point);current={start:at,segments:[],closed:false};result.push(current);continue;}
    if(c.op==='Z'){if(!same(at,current!.start))append([at,lerpPoint(at,current!.start,1/3),lerpPoint(at,current!.start,2/3),current!.start],'L');current!.closed=true;at=current!.start;continue;}
    const to=xy(c.point);
    if(c.op==='L')append([at,lerpPoint(at,to,1/3),lerpPoint(at,to,2/3),to],'L');
    else if(c.op==='Q')append([at,lerpPoint(at,xy(c.control),2/3),lerpPoint(to,xy(c.control),2/3),to],'Q');
    else if(c.op==='C')append([at,xy(c.control1),xy(c.control2),to],'C');
    at=to;
  }
  return result;
}
function tangent(c:Cubic,t:number):XY{
  if(t===0){for(const p of c.slice(1)){const d=sub(p,c[0]);if(Math.hypot(...d)>0)return unit(d);}return [0,0];}
  if(t===1){for(let i=2;i>=0;i--){const d=sub(c[3],c[i]);if(Math.hypot(...d)>0)return unit(d);}return [0,0];}
  const u=1-t,d=add(add(mul(sub(c[1],c[0]),3*u*u),mul(sub(c[2],c[1]),6*u*t)),mul(sub(c[3],c[2]),3*t*t));
  return Math.hypot(...d)>0?unit(d):tangent(c,0);
}
/** Iterative de Casteljau bounds; requested accuracy is never silently reduced. */
function arc(curve:Cubic,tolerance:number,budget:ReturnType<typeof work>):number{
  const pending:[Cubic,number][]=[[curve,tolerance]];let sum=0;
  while(pending.length){
    budget.step();const [c,tol]=pending.pop()!,bounds=lengthBounds(c);
    if(bounds.error<=tol){sum+=bounds.length;continue;}
    const [a,b]=splitCubic(c,.5);
    if(tol/2===0||a.every((p,i)=>same(p,c[i]))||b.every((p,i)=>same(p,c[i])))fail('E_PA_SHAPE_ACCURACY','Requested arc-length tolerance exceeds Float64 resolution');
    pending.push([b,tol/2],[a,tol/2]);
  }
  return sum;
}
function parameter(curve:Cubic,at:number,length:number,tolerance:number,budget:ReturnType<typeof work>):number{
  if(at<=0)return 0;if(at>=length)return 1;
  let lo=0,hi=1,rest=curve,wanted=at;
  for(;;){
    const t=(lo+hi)/2;
    if(t===lo||t===hi)fail('E_PA_SHAPE_ACCURACY','Arc-length inversion reached Float64 resolution');
    const [left,right]=splitCubic(rest,.5),len=arc(left,tolerance/128,budget);
    if(Math.abs(len-wanted)<=tolerance/4)return t;
    if(wanted<len){hi=t;rest=left;}else{lo=t;rest=right;wanted-=len;}
  }
}

/** Thin adapter over canonical Graphics validation, suitable for existing R1 initialization. */
export function createShapeModifiers(graphics:Pick<typeof Graphics,'validatePathData'>){
  const validate=(value:unknown)=>{
    const path=graphics.validatePathData(value);
    if(path.coordinates.unit!=='px')fail('E_PA_SHAPE_SPACE','Shape transforms require explicit pixel coordinates; convert units first');
    return path;
  };
  return {
    /** Lazy copies. Transform = T(index*position) T(anchor) R(index*rotation) S(scale^index) T(-anchor). */
    repeatPath(input:PathData,options:RepeaterOptions,context:FrameContext):IterableIterator<RepeatedPath>{
      const budget=work(options),path=validate(input),copies=scalar(options.copies,context,'copies'),offset=scalar(options.offset??0,context,'offset'),rotation=scalar(options.rotation??0,context,'rotation');
      if(copies<0||!Number.isSafeInteger(Math.ceil(copies)))fail('E_PA_SHAPE_PARAMETER','copies must be nonnegative with an exactly representable copy index');
      const vector=(v:readonly [Signal<number>,Signal<number>],name:string):XY=>{
        if(!Array.isArray(v)||v.length!==2)fail('E_PA_SHAPE_PARAMETER',`${name} needs two coordinates`);
        return [scalar(v[0],context,name+'.x'),scalar(v[1],context,name+'.y')];
      };
      const position=vector(options.position??[0,0],'position'),anchor=vector(options.anchor??[0,0],'anchor'),scale=vector(options.scale??[1,1],'scale'),start=scalar(options.startOpacity??1,context,'startOpacity'),end=scalar(options.endOpacity??1,context,'endOpacity'),order=options.order??'forward',count=Math.ceil(copies);
      if(start<0||start>1||end<0||end>1||!['forward','reverse'].includes(order))fail('E_PA_SHAPE_PARAMETER','Opacity must be [0,1] and order forward or reverse');
      // Signals/configuration and source are captured now; only cancellation stays live.
      return (function*(){
        for(let rank=0;rank<count;rank++){
          budget.check();const index=order==='forward'?rank:count-1-rank,u=index+offset,sx=Math.pow(scale[0],u),sy=Math.pow(scale[1],u),angle=finite(rotation*u,'copy rotation'),cos=Math.cos(angle),sin=Math.sin(angle);
          if(!Number.isFinite(sx)||!Number.isFinite(sy))fail('E_PA_SHAPE_TRANSFORM','Scale power is undefined/overflowing; negative factors need integer copy offsets',{index,offset:u});
          const transform=(p:PathPoint):PathPoint=>{budget.check();const x=(p.x-anchor[0])*sx,y=(p.y-anchor[1])*sy;return {...p,x:anchor[0]+position[0]*u+cos*x-sin*y,y:anchor[1]+position[1]*u+sin*x+cos*y};};
          budget.commands(path.commands.length);
          const commands=path.commands.map((c):PathCommand=>c.op==='Z'?{op:'Z'}:c.op==='C'?{op:'C',control1:transform(c.control1),control2:transform(c.control2),point:transform(c.point)}:c.op==='Q'?{op:'Q',control:transform(c.control),point:transform(c.point)}:{op:c.op,point:transform(c.point)});
          const opacity=(count<=1?start:start+(end-start)*index/(count-1))*Math.min(1,copies-index);
          yield {index,offset:u,opacity,path:validate({...path,commands})};
        }
      })();
    },

    /** Upstream vertex-mean deformation; controls move oppositely, L/Q become cubic. */
    puckerBloat(input:PathData,options:PuckerBloatOptions,context:FrameContext):PathData{
      const budget=work(options),path=validate(input),amount=scalar(options.amount,context,'amount')/100;
      if(amount===0){budget.commands(path.commands.length);return path;}
      const vertices=path.commands.flatMap(c=>c.op==='Z'?[]:[xy(c.point)]);
      const center:XY=[0,0];vertices.forEach(p=>{budget.check();center[0]+=p[0];center[1]+=p[1];});center[0]/=vertices.length;center[1]/=vertices.length;
      const vertex=(p:XY)=>add(p,mul(sub(center,p),amount)),handle=(p:XY)=>add(p,mul(sub(p,center),amount)),out=emitter(path,budget);
      let at:XY=[0,0],start:XY=[0,0];
      for(const c of path.commands){
        budget.check();
        if(c.op==='M'){at=start=xy(c.point);const p=vertex(at);out.push({op:'M',point:{...c.point,x:p[0],y:p[1]}});continue;}
        if(c.op==='Z'){
          if(distance(at,start)>1e-9)out.push({op:'C',control1:out.point(handle(at)),control2:out.point(handle(start)),point:out.point(vertex(start))});
          out.push({op:'Z'});at=start;continue;
        }
        const to=xy(c.point),q=vertex(to),endpoint={...c.point,x:q[0],y:q[1]};
        if(c.op==='L')out.push({op:'C',control1:out.point(handle(at)),control2:out.point(handle(to)),point:endpoint});
        else if(c.op==='Q')out.push({op:'C',control1:out.point(handle(lerpPoint(at,xy(c.control),2/3))),control2:out.point(handle(lerpPoint(to,xy(c.control),2/3))),point:endpoint});
        else if(c.op==='C'){const a=handle(xy(c.control1)),b=handle(xy(c.control2));out.push({op:'C',control1:{...c.control1,x:a[0],y:a[1]},control2:{...c.control2,x:b[0],y:b[1]},point:endpoint});}
        at=to;
      }
      return validate({...path,commands:out.commands});
    },

    /** Upstream cutback/cubic-fillet construction, including curved neighboring segments. */
    roundCorners(input:PathData,options:RoundCornersOptions,context:FrameContext):PathData{
      const budget=work(options),path=validate(input),radius=scalar(options.radius,context,'radius'),tolerance=finite(options.tolerance??1e-3,'tolerance');
      if(radius<0||tolerance<=0)fail('E_PA_SHAPE_PARAMETER','radius must be nonnegative and tolerance positive');
      if(radius===0){budget.commands(path.commands.length);return path;}
      const subs=contours(path,budget),total=subs.reduce((n,s)=>n+s.segments.length,0),accuracy=tolerance/Math.max(1,total),out=emitter(path,budget);
      if(accuracy===0)fail('E_PA_SHAPE_ACCURACY','Requested tolerance cannot be divided at Float64 resolution');
      for(const contour of subs){
        budget.check();const segs=contour.segments,n=segs.length;
        if(!n){out.push({op:'M',point:out.point(contour.start)});if(contour.closed)out.push({op:'Z'});continue;}
        let magnitude=0;for(const s of segs)for(const p of s.curve){budget.check();magnitude=Math.max(magnitude,Math.abs(p[0]),Math.abs(p[1]));}
        if(segs.some(s=>s.kind!=='L')&&accuracy<Math.max(Number.MIN_VALUE,Number.EPSILON*magnitude*8))
          fail('E_PA_SHAPE_ACCURACY','Requested curve tolerance is below a conservative Float64 coordinate-roundoff floor');
        const lengths=segs.map(s=>s.kind==='L'?distance(s.curve[0],s.curve[3]):arc(s.curve,accuracy,budget)),cut=new Float64Array(n),phi=new Float64Array(n);
        for(let i=0;i<n;i++){
          if(!contour.closed&&i===0)continue;
          const prev=(i+n-1)%n,a=tangent(segs[prev].curve,1),b=tangent(segs[i].curve,0),turn=Math.abs(Math.atan2(a[0]*b[1]-a[1]*b[0],a[0]*b[0]+a[1]*b[1]));
          if(turn<1e-3||turn>Math.PI-1e-3)continue; // Audited upstream corner/cusp policy.
          cut[i]=Math.min(radius,lengths[prev]/2,lengths[i]/2);phi[i]=turn;
        }
        const trimmed=segs.map((s,j)=>{
          const invert=(at:number)=>s.kind==='L'?at/lengths[j]:parameter(s.curve,at,lengths[j],accuracy,budget);
          const a=cut[j],b=contour.closed||j+1<n?cut[(j+1)%n]:0,t0=a>0?invert(a):0,t1=Math.max(t0,b>0?invert(Math.max(0,lengths[j]-b)):1);
          return {curve:cubicPart(s.curve,t0,t1),kind:s.kind,startTangent:tangent(s.curve,t0),endTangent:tangent(s.curve,t1)};
        });
        const piece=(s:typeof trimmed[number])=>{
          const c=s.curve;if(c.every(p=>same(p,c[0])))return;
          if(s.kind==='L')out.push({op:'L',point:out.point(c[3])});
          else if(s.kind==='Q')out.push({op:'Q',control:out.point(add(c[0],mul(sub(c[1],c[0]),1.5))),point:out.point(c[3])});
          else out.push({op:'C',control1:out.point(c[1]),control2:out.point(c[2]),point:out.point(c[3])});
        };
        const fillet=(i:number)=>{
          const before=trimmed[(i+n-1)%n],after=trimmed[i],p=before.curve[3],q=after.curve[0],corner=segs[i].curve[0],k=4/3*Math.tan(phi[i]/4)/Math.tan(phi[i]/2);
          out.push({op:'C',control1:out.point(add(p,mul(before.endTangent,distance(p,corner)*k))),control2:out.point(sub(q,mul(after.startTangent,distance(q,corner)*k))),point:out.point(q)});
        };
        out.push({op:'M',point:out.point(trimmed[0].curve[0])});piece(trimmed[0]);
        for(let i=1;i<n;i++){if(cut[i]>0)fillet(i);piece(trimmed[i]);}
        if(contour.closed){if(cut[0]>0)fillet(0);out.push({op:'Z'});}
      }
      return validate({...path,commands:out.commands});
    },
  };
}
