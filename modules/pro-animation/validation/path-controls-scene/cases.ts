import {keyframes} from '../../../../src/core/animation.ts';
import type {FrameContext} from '../../../../src/core/types.ts';
import type {PathData} from '../../../graphics-contracts/types.ts';
import * as k from '../../src/path-controls/index.ts';
import {rectanglePath} from '../../src/path-authoring/index.ts';
import {joinPathContours} from '../../src/smart-path/geometry.ts';
import {constrainLine2D} from '../../src/motion-control/constraints.ts';
import type {PreparedStrokeMesh} from '../../src/stroke-animation/index.ts';
const env={width:640,height:400};
export const inkAlpha=keyframes([{frame:0,value:.65},{frame:7,value:.9}]);
const strength=keyframes([{frame:0,value:.45},{frame:7,value:1}]),angle=keyframes([{frame:0,value:-12},{frame:7,value:18}]),shift=keyframes([{frame:0,value:-8},{frame:7,value:12}]);
function base(){return k.elevatePathSegments(joinPathContours([rectanglePath({center:[0,0],size:[160,100]},env)!,rectanglePath({center:[0,0],size:[55,35]},env)!],{fillRule:'evenodd'}));}
export function pathControlCases(context:FrameContext){
 const original=base(),anchors=k.pathAnchors(original),outer=anchors.filter(a=>a.contour===0).map(a=>a.id),hole=anchors.filter(a=>a.contour===1).map(a=>a.id),trace:object[]=[],result:PathData[]=[];
 const finish=(name:string,p:PathData,slot:number)=>{const x=slot%2*320,y=Math.floor(slot/2)*200,fit=k.fitPathControlBounds(p,{box:{left:x+28,top:y+25,right:x+292,bottom:y+175},mode:'contain'});result.push(fit);trace.push({name,anchors:k.pathAnchors(fit),handles:k.pathHandles(fit),continuity:k.pathContinuity(fit),path:fit});};
 let p=k.smoothPathAnchors(original,{mode:'symmetric',strength},context);p=k.rotatePathHandles(p,{degrees:angle},context);p=k.setPathHandleLengths(p,{anchors:[outer[1]],incoming:25,outgoing:35});p=k.scalePathHandles(p,{scale:[1.1,.8]});p=k.clampPathHandles(p,{maxLength:55});finish('smooth tension',p,0);
 p=k.movePathAnchors(original,{[outer[0]]:[-90,-45],[outer[3]]:[-60,60],[hole[1]]:[shift,-18]},{},context);p=k.alignPathAnchors(p,{anchors:[hole[0],hole[1]],axis:'y',target:'center'});p=k.distributePathAnchors(p,{anchors:outer.slice(0,3),axis:'x',start:-95,end:95});p=k.snapPathAnchors(p,{grid:[5,5]});p=k.projectPathAnchors(p,v=>constrainLine2D(v,{from:[-28,-80],to:[-28,80],extent:'line'}).position,{anchors:[hole[0],hole[3]]});p=k.pinPathAnchors(p,original,{anchors:[outer[3]]});finish('anchor constraints',p,1);
 p=k.smoothPathAnchors(original,{mode:'aligned'});const driver=k.pathHandles(p).find(h=>h.anchorId===outer[1]&&h.side==='outgoing')!;p=k.movePathHandles(p,{[driver.id]:[driver.position[0]+8,shift]},{},context);p=k.mirrorPathHandles(p,{anchors:[outer[1]],driver:'outgoing',length:'preserve'});p=k.reflectPathPoints(p,{from:[0,-100],to:[0,100]});p=k.transformPathPoints(p,[1,.08,.12,1,3,0]);finish('mirrored handles',p,2);
 p=k.straightenPathSegments(original,{anchors:[outer[0],outer[2]]});p=k.elevatePathSegments(p,{anchors:[outer[0],outer[2]],degree:2});p=k.elevatePathSegments(p);p=k.smoothPathAnchors(p,{mode:'aligned',strength},context);finish('degree and smoothing',p,3);
 return {paths:result,trace};
}
/** Fixture-only guide quads; the existing Native mesh renderer owns all pixels. */
export function guideMesh(paths:readonly PathData[]):PreparedStrokeMesh {
 const positions:number[]=[];const quad=(a:readonly[number,number],b:readonly[number,number],width:number)=>{const dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy);if(!len)return;const nx=-dy/len*width/2,ny=dx/len*width/2;for(const [x,y]of [[a[0]+nx,a[1]+ny],[a[0]-nx,a[1]-ny],[b[0]-nx,b[1]-ny],[a[0]+nx,a[1]+ny],[b[0]-nx,b[1]-ny],[b[0]+nx,b[1]+ny]])positions.push(x,y,.5);};
 for(const path of paths){const anchors=k.pathAnchors(path),map=new Map(anchors.map(a=>[a.id,a])),continuity=new Map(k.pathContinuity(path).map(a=>[a.anchorId,a.kind]));for(const h of k.pathHandles(path))quad(map.get(h.anchorId)!.position,h.position,.65);for(const a of anchors){const r=continuity.get(a.id)==='c1'?2:1.5,[x,y]=a.position;for(const [px,py]of [[x-r,y-r],[x+r,y-r],[x+r,y+r],[x-r,y-r],[x+r,y+r],[x-r,y+r]])positions.push(px,py,.5);}}
 return {coordinates:paths[0].coordinates,closed:false,positions,parameters:Array.from({length:positions.length/3},()=>0),diagnostics:[],preparation:{faces:positions.length/18,triangles:positions.length/9,maxAreaDeviation:0,roundTolerance:.02,gridSize:.0025,sampleCount:0}};
}
