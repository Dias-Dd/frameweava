import {keyframes} from '../../../../src/core/animation.ts';
import type {PathData} from '../../../../modules/graphics-contracts/types.ts';
import {createPathMotion} from '../../../../modules/pro-animation/src/path-motion.ts';
export function scenePath(width=640,height=240):PathData{
 let n=0;const p=(x:number,y:number)=>({id:'m.'+n++,x,y});return {schema:'frameweave.path',version:1,id:'motion.baselines',coordinates:{spaceId:'canvas',unit:'px',origin:'top-left',x:'right',y:'down',width,height},fillRule:'nonzero',commands:[
  {op:'M',point:p(40,95)},{op:'C',control1:p(90,5),control2:p(245,5),point:p(300,95)},
  {op:'M',point:p(65,155)},{op:'L',point:p(250,155)},{op:'Q',control:p(280,155),point:p(280,180)},{op:'Q',control:p(280,205),point:p(250,205)},{op:'L',point:p(65,205)},{op:'Q',control:p(40,205),point:p(40,180)},{op:'Q',control:p(40,155),point:p(65,155)},{op:'Z'},
  {op:'M',point:p(365,195)},{op:'Q',control:p(485,45),point:p(605,195)},
 ]};
}
export function sceneMotions(curve:Parameters<typeof createPathMotion>[0]){return [
 {id:'speed-ping-pong',motion:createPathMotion(curve,{contour:0,speed:keyframes([{frame:0,value:500},{frame:11,value:700,easing:'easeInOut'}]),boundary:'ping-pong',orient:'travel'})},
 {id:'closed-wrap',motion:createPathMotion(curve,{contour:1,speed:keyframes([{frame:0,value:220}]),startDistance:curve.metrics.contours[1].length*.8,boundary:'wrap',orient:'travel'})},
 {id:'progress-normal',motion:createPathMotion(curve,{contour:2,progress:keyframes([{frame:0,value:0},{frame:11,value:1,easing:'easeInOut'}]),normalOffset:keyframes([{frame:0,value:-8},{frame:11,value:8}]),rotation:keyframes([{frame:0,value:0},{frame:11,value:Math.PI/6}])})},
];}
