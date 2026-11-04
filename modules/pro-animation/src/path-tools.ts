import {EngineError} from '../../../src/core/errors.ts';
import {evaluate} from '../../../src/core/animation.ts';
import type {FrameContext,Signal} from '../../../src/core/types.ts';
import type {PathData,PathCommand} from '../../graphics-contracts/types.ts';
import type * as Graphics from '../../graphics-contracts/index.ts';
import {cubicPoint,splitCubic,cubicPart,lengthBounds,distance,lerpPoint,signedArea,correspondenceCost,type XY,type Cubic} from './geometry.ts';
export interface PathMeasureOptions {/** Absolute path-length budget in declared px units. */ tolerance?:number}
export interface CurveTrimOptions extends PathMeasureOptions {mode:'curves';start?:Signal<number>;end:Signal<number>;offsetDegrees?:Signal<number>;wrap?:boolean;contours?:'concatenated'|'individual'}
export interface MatchPathOptions extends PathMeasureOptions {samplesPerContour:number;contourMap?:number[];alignment?:'preserve-start'|'cyclic';direction?:'preserve'|'reverse-target'}
export interface PathSample {x:number;y:number;angleRadians:number;contourIndex:number;distance:number}
type Segment={curve:Cubic;kind:'L'|'Q'|'C';quad?:XY;length:number;error:number};
type Contour={start:XY;segments:Segment[];closed:boolean;length:number;error:number};
const fail=(code:string,message:string):never=>{throw new EngineError(code,message);};
const finite=(v:number,name:string,min:number,max:number)=>{if(!Number.isFinite(v)||v<min||v>max)fail('E_PA_PARAMETER',`${name} must be finite [${min},${max}]`);return v;};
const evaluated=(v:Signal<number>,ctx:FrameContext,name:string,min:number,max:number)=>finite(evaluate(v,ctx),name,min,max);

/** Small mathematical adapter over canonical Graphics PathData. No drawing/document model or global cache. */
export function createPathTools(graphics:Pick<typeof Graphics,'validatePathData'>){
 const validate=(v:unknown):PathData=>{try{return graphics.validatePathData(v);}catch(e){const error=e as {code?:string;message?:string;details?:unknown};throw new EngineError(error.code??'E_PA_GRAPHICS',error.message??'Path validation failed',{details:error.details});}};
 function measured(input:PathData,options:PathMeasureOptions={}){
  const path=validate(input);if(path.coordinates.unit!=='px')fail('E_PA_SPACE','Arc length and sampling require declared pixel units');
  const tolerance=finite(options.tolerance??1e-3,'tolerance',1e-6,1),contours:Contour[]=[];let current:Contour|undefined,point:XY=[0,0];
  const append=(curve:Cubic,kind:Segment['kind'],quad?:XY)=>current!.segments.push({curve,kind,quad,length:0,error:0});
  for(const command of path.commands){
   if(command.op==='M'){point=[command.point.x,command.point.y];current={start:point,segments:[],closed:false,length:0,error:0};contours.push(current);continue;}
   if(command.op==='Z'){if(distance(point,current!.start)>0)append([point,lerpPoint(point,current!.start,1/3),lerpPoint(point,current!.start,2/3),current!.start],'L');current!.closed=true;point=current!.start;continue;}
   const to:XY=[command.point.x,command.point.y];
   if(command.op==='L')append([point,lerpPoint(point,to,1/3),lerpPoint(point,to,2/3),to],'L');
   else if(command.op==='Q'){const q:XY=[command.control.x,command.control.y];append([point,lerpPoint(point,q,2/3),lerpPoint(to,q,2/3),to],'Q',q);}
   else if(command.op==='C')append([point,[command.control1.x,command.control1.y],[command.control2.x,command.control2.y],to],'C');point=to;
  }
  const count=contours.reduce((s,c)=>s+c.segments.length,0);if(count>1024||contours.length>64)fail('E_PA_LIMIT','At most 1024 segments and 64 contours');
  function arclength(curve:Cubic,budget:number,depth=0,counter={n:0}):{length:number;error:number}{
   if(++counter.n>65536||depth>24)fail('E_PA_PATH_ACCURACY','Curve exceeds adaptive subdivision budget; increase tolerance');
   const bounds=lengthBounds(curve);if(bounds.error<=budget)return bounds;
   const [a,b]=splitCubic(curve,.5),left=arclength(a,budget/2,depth+1,counter),right=arclength(b,budget/2,depth+1,counter);return {length:left.length+right.length,error:left.error+right.error};
  }
  const per=tolerance/Math.max(1,count),counter={n:0};for(const c of contours)for(const s of c.segments){const value=arclength(s.curve,per,0,counter);s.length=value.length;s.error=value.error;c.length+=s.length;c.error+=s.error;}
  const length=contours.reduce((s,c)=>s+c.length,0),errorBound=contours.reduce((s,c)=>s+c.error,0);
  function parameter(s:Segment,at:number){if(at<=0)return 0;if(at>=s.length)return 1;if(s.kind==='L')return at/s.length;
   let lo=0,hi=1,rest=s.curve,wanted=at;const counter={n:0};for(let i=0;i<48;i++){const t=(lo+hi)/2,[left,right]=splitCubic(rest,.5),value=arclength(left,tolerance/128,0,counter);if(Math.abs(value.length-wanted)<=tolerance/4)return t;if(wanted<value.length){hi=t;rest=left;}else{lo=t;rest=right;wanted-=value.length;}}return (lo+hi)/2;
  }
  function sample(fraction:number,contourIndex?:number):PathSample{
   finite(fraction,'fraction',0,1);if(contourIndex!==undefined&&(!Number.isInteger(contourIndex)||contourIndex<0||contourIndex>=contours.length))fail('E_PA_CONTOUR','Unknown contour index');
   const list=contourIndex===undefined?contours:[contours[contourIndex]],total=list.reduce((a,c)=>a+c.length,0);if(total<=1e-12)fail('E_PA_PATH_DEGENERATE','Cannot sample a zero-length path');
   let at=fraction*total,last:Segment|undefined,index=0;
   for(const c of list){index=contours.indexOf(c);for(const s of c.segments){if(s.length<=0)continue;last=s;if(at<=s.length||fraction===1&&c===list.at(-1)&&s===c.segments.at(-1)){const t=parameter(s,at),p=cubicPoint(s.curve,t),before=cubicPoint(s.curve,Math.max(0,t-1e-5)),after=cubicPoint(s.curve,Math.min(1,t+1e-5));return {x:p[0],y:p[1],angleRadians:Math.atan2(after[1]-before[1],after[0]-before[0]),contourIndex:index,distance:fraction*total};}at-=s.length;}}
   const p=last!.curve[3];return {x:p[0],y:p[1],angleRadians:0,contourIndex:index,distance:total};
  }
  return {path,tolerance,contours,length,errorBound,parameter,sample};
 }
 function createPathSampler(input:PathData,options:PathMeasureOptions={}){const m=measured(input,options);return {metrics:{length:m.length,errorBound:m.errorBound,contours:m.contours.map(c=>({length:c.length,errorBound:c.error,closed:c.closed}))},sample:m.sample};}
 return {
  createPathSampler,
  measurePath(input:PathData,options:PathMeasureOptions={}){return createPathSampler(input,options).metrics;},
  trimCurves(input:PathData,options:CurveTrimOptions,context:FrameContext):PathData{
   if(options.mode!=='curves')fail('E_PA_PARAMETER','Curve mode must be explicit');
   const m=measured(input,options),start=evaluated(options.start??0,context,'start',0,1),end=evaluated(options.end,context,'end',0,1),offset=evaluated(options.offsetDegrees??0,context,'offsetDegrees',-1e9,1e9)/360;
   if(options.contours!==undefined&&!['concatenated','individual'].includes(options.contours))fail('E_PA_PARAMETER','Unknown contour trim mode');
   if(start>end&&!options.wrap)fail('E_PA_PARAMETER','start > end requires explicit wrap');
   const span=end-start+(start>end?1:0);if(span===1)return m.path;
   const a=((start+offset)%1+1)%1,intervals=span===0?[]:a+span<=1?[[a,a+span]]:[[a,1],[0,a+span-1]],commands:PathCommand[]=[];let sequence=0,lastContour=-1,lastPoint:XY|undefined;
   const p=(xy:XY)=>({id:'pa.trim.'+sequence++,x:xy[0],y:xy[1]});
   for(const [a,b]of intervals){if(lastContour>=0&&!m.contours[lastContour].closed){lastContour=-1;lastPoint=undefined;}let base=0;for(let ci=0;ci<m.contours.length;ci++){const c=m.contours[ci],individual=options.contours==='individual',total=individual?c.length:m.length,from=a*total-(individual?0:base),to=b*total-(individual?0:base);base+=c.length;let acc=0;const before=commands.length;
    for(const s of c.segments){const sa=acc,sb=acc+s.length;acc=sb;if(s.length<=0||to<=sa||from>=sb)continue;const t0=m.parameter(s,Math.max(0,from-sa)),t1=m.parameter(s,Math.min(s.length,to-sa));if(t1<=t0)continue;const piece=cubicPart(s.curve,t0,t1);
     if(lastContour!==ci||!lastPoint||distance(lastPoint,piece[0])>m.tolerance)commands.push({op:'M',point:p(piece[0])});
     if(s.kind==='L')commands.push({op:'L',point:p(piece[3])});else if(s.kind==='Q'){const control:XY=[piece[0][0]+1.5*(piece[1][0]-piece[0][0]),piece[0][1]+1.5*(piece[1][1]-piece[0][1])];commands.push({op:'Q',control:p(control),point:p(piece[3])});}else commands.push({op:'C',control1:p(piece[1]),control2:p(piece[2]),point:p(piece[3])});
     lastContour=ci;lastPoint=piece[3];
    }if(c.closed&&from<=0&&to>=c.length&&c.length>0&&commands.length>before){commands.push({op:'Z'});lastContour=-1;lastPoint=undefined;}
   }}
   if(!commands.length)commands.push({op:'M',point:p(m.contours[0].start)});
   return validate({...m.path,commands});
  },
  /** Explicit contour mapping; arc-resampled polyline correspondence, not automatic topology repair. */
  matchPaths(from:PathData,to:PathData,options:MatchPathOptions){
   const a=measured(from,options),b=measured(to,options),n=options.samplesPerContour;
   if(JSON.stringify(a.path.coordinates)!==JSON.stringify(b.path.coordinates)||a.path.fillRule!==b.path.fillRule)fail('E_PA_SPACE','Morph matching needs identical coordinates and fill rule');
   if(!Number.isInteger(n)||n<3||n>128)fail('E_PA_LIMIT','samplesPerContour must be integer3..128');
   if(options.alignment!==undefined&&!['cyclic','preserve-start'].includes(options.alignment)||options.direction!==undefined&&!['preserve','reverse-target'].includes(options.direction))fail('E_PA_PARAMETER','Unknown correspondence strategy');
   const map=options.contourMap??a.contours.map((_,i)=>i);if(a.contours.length!==b.contours.length||map.length!==a.contours.length||new Set(map).size!==map.length||map.some(i=>!Number.isInteger(i)||i<0||i>=b.contours.length))fail('E_PA_CONTOUR','Supply a one-to-one map for an equal number of contours');
   if(a.contours.length>1&&!options.contourMap)fail('E_PA_CONTOUR','Multiple contours/holes need an explicit contourMap; no guessed hole identity');
   const rows: {contour:number;targetContour:number;closed:boolean;offset:number;reversed:boolean;cost:number}[]=[],aa:PathCommand[]=[],bb:PathCommand[]=[];
   for(let ci=0;ci<a.contours.length;ci++){const target=map[ci],closed=a.contours[ci].closed;if(closed!==b.contours[target].closed)fail('E_PA_CONTOUR','Cannot match open and closed contours');
    const points=(m:typeof a,c:number)=>Array.from({length:n},(_,i):XY=>{const p=m.sample(i/(closed?n:n-1),c);return [p.x,p.y];}),pa=points(a,ci);let pb=points(b,target);const reversed=options.direction==='reverse-target';if(reversed)pb=closed?[pb[0],...pb.slice(1).reverse()]:pb.reverse();
    if(closed&&(Math.abs(signedArea(pa))<1e-9||Math.abs(signedArea(pb))<1e-9))fail('E_PA_PATH_DEGENERATE','Closed correspondence needs nondegenerate sampled area');
    if(closed&&Math.sign(signedArea(pa))!==Math.sign(signedArea(pb)))fail('E_PA_WINDING','Contour winding differs; request an explicit global reverse-target strategy');
    let offset=0,cost=correspondenceCost(pa,pb,0);if(closed&&options.alignment==='cyclic')for(let i=1;i<n;i++){const v=correspondenceCost(pa,pb,i);if(v<cost){cost=v;offset=i;}}
    pb=pb.map((_,i)=>pb[(i+offset)%n]);for(let i=0;i<n;i++){const id=`pa.match.${ci}.${i}`,command=(point:XY):PathCommand=>({op:i?'L':'M',point:{id,x:point[0],y:point[1]}});aa.push(command(pa[i]));bb.push(command(pb[i]));}if(closed){aa.push({op:'Z'});bb.push({op:'Z'});}rows.push({contour:ci,targetContour:target,closed,offset,reversed,cost});
   }
   return {from:validate({...a.path,commands:aa}),to:validate({...b.path,commands:bb}),diagnostics:rows,approximation:'arc-resampled polylines; endpoints approximate original curves; no self-intersection repair' as const};
  },
 };
}
