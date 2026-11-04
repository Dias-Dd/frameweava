import type {FrameContext} from '../../../src/core/types.ts';import type {PathData} from '../../graphics-contracts/types.ts';import {expr} from '../../../src/core/animation.ts';
function curvePath(rows:number[][]):PathData {const point=(id:string,x:number,y:number)=>({id,x,y}),[a,b]=rows;return {schema:'frameweave.path',version:1,id:'live-baseline',coordinates:{spaceId:'canvas',unit:'px',origin:'top-left',x:'right',y:'down',width:720,height:400},fillRule:'nonzero',commands:[{op:'M',point:point('p.0',a[0],a[1])},{op:'C',control1:point('p.1',b[0],b[1]),control2:point('p.2',b[2],b[3]),point:point('p.3',b[4],b[5])}]};}
export const morphProgress=expr.add(.5,expr.mul(.3,expr.sin(expr.add(expr.time,expr.globalTime))));
export const textOffset=expr.mul(12,expr.sin(expr.globalTime));
export function livePaths(){return {from:curvePath([[20,150],[180,50,520,220,700,150]]),to:curvePath([[20,180],[240,260,470,20,700,100]])};}
export function subframeContext(frame:number):FrameContext{return {frame,time:frame/4,globalFrame:(frame-1)/1.5,globalTime:(frame-1)/6,dt:1.5/4,progress:((frame-1)/1.5)/7,durationInFrames:8,fps:{num:4,den:1},seed:31};}
