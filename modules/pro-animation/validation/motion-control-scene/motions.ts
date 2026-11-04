import {expr,keyframes} from '../../../../src/core/animation.ts';
import type {FrameContext} from '../../../../src/core/types.ts';
import * as m from '../../src/motion-control/index.ts';
export interface MotionDisplay {name:string;group:number;source:m.MotionSource2D;bank?:boolean;stretch?:boolean}
export function motionDisplays():MotionDisplay[]{
 const orbit=m.orbitMotion2D({center:[0,0],radius:[26,18],frequency:.6}),osc=m.oscillateMotion2D({center:[0,0],amplitude:[26,20],frequencies:[.4,.7]}),bezier=m.bezierMotion2D({points:[[-28,18],[-20,-28],[20,28],[28,-18]]}),base:m.MotionSource2D=ctx=>[55*Math.sin(ctx.time*2.7),45*Math.cos(ctx.time*2.1)],target=m.orbitMotion2D({center:[10,0],radius:[12,16],frequency:.4});
 const sourceItems:MotionDisplay[]=[
  {name:'signalMotion2D',group:0,source:m.signalMotion2D([keyframes([{frame:0,value:-25},{frame:47,value:25,easing:'easeInOut'}]),expr.mul(expr.sin(expr.mul(expr.time,4)),18)])},
  {name:'orbitMotion2D',group:0,source:orbit},
  {name:'oscillateMotion2D',group:0,source:osc},
  {name:'spiralMotion2D',group:0,source:m.spiralMotion2D({center:[0,0],radius:3,growth:10,frequency:1})},
  {name:'bezierMotion2D',group:0,source:bezier},
  {name:'springMotion2D',group:0,source:m.springMotion2D({from:[-25,18],to:[22,-18],velocity:[20,0],stiffness:55,damping:5})},
  {name:'inertiaMotion2D',group:0,source:m.inertiaMotion2D({from:[-25,16],velocity:[85,-60],timeConstantSeconds:.5,boundsX:{max:25},boundsY:{min:-20}})},
  {name:'staggerMotion2D',group:0,source:m.staggerMotion2D(orbit,{index:3,delaySeconds:.15})},
  {name:'loopMotion2D',group:0,source:m.loopMotion2D(bezier,{start:0,duration:.6,mode:'ping-pong'})},
  {name:'transformMotion2D',group:0,source:m.transformMotion2D(osc,{rotationDegrees:expr.mul(expr.time,60),scale:.75})},
  {name:'blendMotion2D',group:0,source:m.blendMotion2D(orbit,bezier,keyframes([{frame:0,value:0},{frame:47,value:1}]))},
 ];
 const constrained:(readonly [string,(p:m.Point2D)=>m.PointConstraint2D])[]=[
  ['constrainBox2D',p=>m.constrainBox2D(p,{min:[-26,-20],max:[26,20]})],
  ['constrainDistance2D',p=>m.constrainDistance2D(p,{center:[0,0],min:12,max:25})],
  ['constrainLine2D',p=>m.constrainLine2D(p,{from:[-25,-15],to:[25,15]})],
  ['constrainHalfPlane2D',p=>m.constrainBox2D(m.constrainHalfPlane2D(p,{origin:[0,0],normal:[1,-1]}).position,{min:[-26,-20],max:[26,20]})],
  ['constrainAngle2D',p=>m.constrainAngle2D(m.constrainDistance2D(p,{center:[0,0],max:26}).position,{center:[0,0],limitsDegrees:[-60,60]})],
  ['snapGrid2D',p=>m.snapGrid2D([p[0]*.5,p[1]*.5],{step:[12,10]})],
  ['snapGuides2D',p=>m.snapGuides2D([p[0]*.5,p[1]*.5],{x:[-20,0,20],y:[-15,0,15],maxDistance:8})],
  ['wrapPosition2D',p=>m.wrapPosition2D(p,{min:[-26,-20],max:[26,20]})],
  ['mirrorPosition2D',p=>m.mirrorPosition2D(p,{min:[-26,-20],max:[26,20]})],
 ];
 sourceItems.push(...constrained.map(([name,solve])=>({name,group:1,source:(ctx:FrameContext)=>solve(base(ctx)).position})));
 sourceItems.push(
  {name:'sampleMotion2D',group:2,source:orbit},
  {name:'predictMotion2D',group:2,source:ctx=>m.predictMotion2D(m.sampleMotion2D(orbit,ctx),.12,{acceleration:true}).position},
  {name:'orientMotion2D',group:2,source:osc},
  {name:'stretchMotion2D',group:2,source:orbit,stretch:true},
  {name:'bankMotion2D',group:2,source:orbit,bank:true},
  {name:'leadTarget2D',group:2,source:ctx=>{const sample=m.sampleMotion2D(target,ctx);return m.leadTarget2D([-20,0],sample.position,sample.velocity,{speed:100}).position??[0,0];}},
 );return sourceItems;
}
export function motionGeometry(displays:readonly MotionDisplay[],context:FrameContext,width:number,height:number){
 const groups=[[] as number[],[] as number[],[] as number[]],poses:object[]=[],cellX=width/6,cellY=height/5;
 for(const [index,display]of displays.entries()){
  const sample=m.sampleMotion2D(display.source,context),aim=m.orientMotion2D(sample),stretch=m.stretchMotion2D(sample,{referenceSpeed:200,amount:display.stretch?2:.45,maxScale:2.2}),bank=display.bank?m.bankMotion2D(sample,{referenceAcceleration:300,maxDegrees:35}).rotationDegrees:0,rotation=(aim.rotationDegrees+bank)*Math.PI/180;
  const cx=(index%6+.5)*cellX+sample.position[0],cy=(Math.floor(index/6)+.5)*cellY+sample.position[1],vertices:number[]=[];
  for(const [x,y]of [[9,0],[-7,-4],[-7,4]]){const sx=x*stretch.scaleX,sy=y*stretch.scaleY;vertices.push(cx+Math.cos(rotation)*sx-Math.sin(rotation)*sy,cy+Math.sin(rotation)*sx+Math.cos(rotation)*sy,.5);}
  groups[display.group].push(...vertices);poses.push({name:display.name,index,position:sample.position,velocity:sample.velocity,acceleration:sample.acceleration,rotation,scale:[stretch.scaleX,stretch.scaleY],vertices});
 }return {groups:groups.map(v=>Float32Array.from(v)),poses};
}
