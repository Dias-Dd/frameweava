// SPDX-License-Identifier: Apache-2.0
// Canonical PathData conversion/editing only; existing geometry owns cubic arithmetic.
import * as graphics from '../../../graphics-contracts/index.ts';
import type {PathData,PathCommand,PathPoint} from '../../../graphics-contracts/types.ts';
import {EngineError} from '../../../../src/core/errors.ts';
import {lerpPoint,type XY} from '../geometry.ts';
export function pathFail(message:string,details?:unknown):never{throw new EngineError('E_PA_SMART_PATH',message,{details});}
export interface ContourRows {closed:boolean;vertices:XY[];incoming:XY[];outgoing:XY[]}
const xy=(p:PathPoint):XY=>[p.x,p.y];
const equal=(a:XY,b:XY)=>a[0]===b[0]&&a[1]===b[1];
function reidentify(path:PathData,commands:PathCommand[]):PathData{let id=0;const p=(point:PathPoint)=>({...point,id:'sp.'+(id++).toString(36)});return graphics.validatePathData({...path,commands:commands.map(c=>c.op==='Z'?c:c.op==='Q'?{...c,control:p(c.control),point:p(c.point)}:c.op==='C'?{...c,control1:p(c.control1),control2:p(c.control2),point:p(c.point)}:{...c,point:p(c.point)})});}
export function splitPathContours(input:PathData):PathData[]{const path=graphics.validatePathData(input),sets:PathCommand[][]=[];for(const c of path.commands){if(c.op==='M')sets.push([]);sets.at(-1)!.push(c);}return sets.map(commands=>reidentify(path,commands));}
export function joinPathContours(inputs:Iterable<PathData>,options:{fillRule?:PathData['fillRule']}={}):PathData{
 const list=[...inputs].map(graphics.validatePathData);if(!list.length)pathFail('At least one explicit canonical contour required');const first=list[0],fillRule=options.fillRule??first.fillRule,commands:PathCommand[]=[];
 for(const path of list){if(JSON.stringify(path.coordinates)!==JSON.stringify(first.coordinates)||!options.fillRule&&path.fillRule!==fillRule)pathFail('Identical coordinates and explicit consistent fill rule required');for(const command of path.commands)commands.push(command);}
 return reidentify({...first,fillRule},commands);
}
function indices(input:readonly number[],count:number,all:boolean){if(!Array.isArray(input)||new Set(input).size!==input.length||input.some(i=>!Number.isSafeInteger(i)||i<0||i>=count)||!input.length||all&&input.length!==count)pathFail('Explicit nonempty unique contour indices/permutation required');return [...input];}
export function selectPathContours(input:PathData,selected:readonly number[]):PathData{const contours=splitPathContours(input);return joinPathContours(indices(selected,contours.length,false).map(i=>contours[i]));}
export function reorderPathContours(input:PathData,order:readonly number[]):PathData{const contours=splitPathContours(input);return joinPathContours(indices(order,contours.length,true).map(i=>contours[i]));}
/** Lines/quadratics become cubics; explicit Z closing edge is represented exactly. */
export function pathToCubics(input:PathData):PathData{
 const path=graphics.validatePathData(input),commands:PathCommand[]=[];let at:XY=[0,0],start:XY=[0,0];const p=(q:XY)=>({id:'temporary',x:q[0],y:q[1]}),line=(a:XY,b:XY):PathCommand=>({op:'C',control1:p(lerpPoint(a,b,1/3)),control2:p(lerpPoint(a,b,2/3)),point:p(b)});
 for(const c of path.commands){if(c.op==='M'){at=start=xy(c.point);commands.push({...c});continue;}if(c.op==='Z'){if(!equal(at,start))commands.push(line(at,start));commands.push({op:'Z'});at=start;continue;}const end=xy(c.point);commands.push(c.op==='C'?c:c.op==='L'?line(at,end):c.op==='Q'?{op:'C',control1:p(lerpPoint(at,xy(c.control),2/3)),control2:p(lerpPoint(end,xy(c.control),2/3)),point:p(end)}:pathFail('Supported canonical curve command required'));at=end;}
 return reidentify(path,commands);
}
export function openPathContours(input:PathData,options:{contours?:readonly number[]}={}):PathData{
 const paths=splitPathContours(pathToCubics(input)),selected=new Set(options.contours?indices(options.contours,paths.length,false):paths.map((_,i)=>i));return joinPathContours(paths.map((p,i)=>selected.has(i)?reidentify(p,p.commands.filter(c=>c.op!=='Z')):p));
}
export function closePathContours(input:PathData,options:{contours?:readonly number[]}={}):PathData{
 const paths=splitPathContours(input),selected=new Set(options.contours?indices(options.contours,paths.length,false):paths.map((_,i)=>i));return pathToCubics(joinPathContours(paths.map((p,i)=>selected.has(i)&&p.commands.at(-1)!.op!=='Z'?reidentify(p,[...p.commands,{op:'Z'}]):p)));
}
/** Private numeric bridge to upstream ShapePath; this is not a new professional data schema. */
export function contourRows(input:PathData):ContourRows{
 const path=pathToCubics(input);if(path.commands.filter(c=>c.op==='M').length!==1)pathFail('This upstream operation consumes one contour; choose/split explicit contours');const first=path.commands[0];if(first.op!=='M')pathFail('Initial M required');const start=xy(first.point),vertices:XY[]=[start],incoming:XY[]=[[0,0]],outgoing:XY[]=[[0,0]];let at=start;
 for(const c of path.commands){if(c.op!=='C')continue;outgoing[outgoing.length-1]=[c.control1.x-at[0],c.control1.y-at[1]];vertices.push(xy(c.point));incoming.push([c.control2.x-c.point.x,c.control2.y-c.point.y]);outgoing.push([0,0]);at=xy(c.point);}
 const closed=path.commands.at(-1)!.op==='Z';if(closed&&vertices.length>1&&equal(vertices.at(-1)!,start)){incoming[0]=incoming.at(-1)!;vertices.pop();incoming.pop();outgoing.pop();}return {closed,vertices,incoming,outgoing};
}
export function rowsToPath(template:PathData,rows:ContourRows):PathData{
 if(!rows.vertices.length||rows.incoming.length!==rows.vertices.length||rows.outgoing.length!==rows.vertices.length)pathFail('Complete upstream control arrays required');const point=(p:XY)=>({id:'temporary',x:p[0],y:p[1]}),commands:PathCommand[]=[{op:'M',point:point(rows.vertices[0])}],segments=rows.closed?rows.vertices.length:rows.vertices.length-1;
 for(let i=0;i<segments;i++){const j=(i+1)%rows.vertices.length,a=rows.vertices[i],b=rows.vertices[j];commands.push({op:'C',control1:point([a[0]+rows.outgoing[i][0],a[1]+rows.outgoing[i][1]]),control2:point([b[0]+rows.incoming[j][0],b[1]+rows.incoming[j][1]]),point:point(b)});}if(rows.closed)commands.push({op:'Z'});return reidentify(template,commands);
}
