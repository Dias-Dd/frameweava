// SPDX-License-Identifier: Apache-2.0
import {EngineError} from '../../../../src/core/errors.ts';
import {evaluate} from '../../../../src/core/animation.ts';
import type {FrameContext,Signal} from '../../../../src/core/types.ts';
import * as graphics from '../../../graphics-contracts/index.ts';
import type {PathData,PathCommand,Coordinates2D} from '../../../graphics-contracts/types.ts';
import type {DrawingContext} from '../../vendor/d3-shape/src/index.js';
export type Scalar=Signal<number>;
export type Point=readonly [Scalar,Scalar];
export interface PathEnvironment {width:number;height:number;spaceId?:string}
export interface PathOptions {id?:string;label?:string;fillRule?:'nonzero'|'evenodd';/** Circular arc -> cubic absolute positional interpolation bound, px. */arcTolerance?:number;signal?:AbortSignal;/** Optional caller resource budget; canonical Graphics limits remain. */maxCommands?:number}
export const fail=(parameter:string,message:string):never=>{throw new EngineError('E_PA_PATH_AUTHORING',`${parameter}: ${message}`,{details:{parameter}});};
export function finite(n:number,name:string){if(typeof n!=='number'||!Number.isFinite(n))fail(name,'finite number');return n;}
export function scalar(value:Scalar,context:FrameContext|undefined,name:string){if(typeof value!=='number'&&(!context||!Number.isFinite(context.time)||!Number.isFinite(context.frame)))fail('context','explicit existing FrameContext for Signals');return finite(typeof value==='number'?value:evaluate(value,context!),name);}
export function positive(n:number,name:string,zero=false){finite(n,name);if(zero?n<0:n<=0)fail(name,zero?'nonnegative':'positive');return n;}
export function fraction(n:number,name:string){finite(n,name);if(n<0||n>1)fail(name,'fraction in [0,1]');return n;}
export function xy(point:Point,context:FrameContext|undefined,name:string):[number,number]{if(!Array.isArray(point)||point.length!==2)fail(name,'two components');return [scalar(point[0],context,name+'.x'),scalar(point[1],context,name+'.y')];}
export function coordinates(environment:PathEnvironment):Coordinates2D {const {width,height,spaceId='canvas'}=environment??{};if(!Number.isSafeInteger(width)||width<1||!Number.isSafeInteger(height)||height<1||typeof spaceId!=='string'||!spaceId.trim())fail('environment','positive integer dimensions and nonempty coordinate-space identity');return {spaceId,width,height,unit:'px',origin:'top-left',x:'right',y:'down'};}
/** Path callbacks only, never a Canvas or CPU rasterizer. Arc lowering uses cubic Hermite
 * interpolation of the exact trig functions: per-coordinate |error| <= r*angle^4/384.
 * The Frobenius norm conservatively propagates that bound through an explicit affine map. */
export function sink(options:PathOptions,environment:PathEnvironment,matrix:readonly [number,number,number,number,number,number]=[1,0,0,1,0,0],forceClose=false){
 const coords=coordinates(environment),tolerance=positive(options.arcTolerance??.001,'arcTolerance'),limit=options.maxCommands??graphics.LIMITS.commands;if(!Number.isSafeInteger(limit)||limit<1)fail('maxCommands','positive safe integer caller budget');if(options.fillRule!==undefined&&!['evenodd','nonzero'].includes(options.fillRule))fail('fillRule','evenodd or nonzero');if(options.signal!==undefined&&!(options.signal instanceof AbortSignal))fail('signal','AbortSignal');
 const commands:PathCommand[]=[];let serial=0,current:[number,number]|undefined,origin:[number,number]|undefined,closed=false;const check=()=>{if(options.signal?.aborted)throw new EngineError('E_RENDER_CANCELLED','Canonical path creation cancelled');};check();const push=(c:PathCommand)=>{check();if(commands.length>=Math.min(limit,graphics.LIMITS.commands))throw new EngineError('E_GRAPHICS_LIMIT','Path output exceeds the existing canonical/caller command budget',{details:{limit:Math.min(limit,graphics.LIMITS.commands)}});commands.push(c);};
 const point=(x:number,y:number)=>({id:'pa.author.'+serial++,x:finite(matrix[0]*finite(x,'x')+matrix[2]*finite(y,'y')+matrix[4],'mapped x'),y:finite(matrix[1]*x+matrix[3]*y+matrix[5],'mapped y')});
 const ensure=()=>{if(!current)fail('path','moveTo before drawing a segment');if(closed){push({op:'M',point:point(...current!)});origin=current;closed=false;}};
 const context:DrawingContext={
  moveTo(x,y){if(forceClose&&current&&!closed)this.closePath();current=[finite(x,'x'),finite(y,'y')];origin=current;closed=false;push({op:'M',point:point(x,y)});},
  lineTo(x,y){if(!current){this.moveTo(x,y);return;}ensure();push({op:'L',point:point(x,y)});current=[x,y];},
  bezierCurveTo(x1,y1,x2,y2,x,y){ensure();push({op:'C',control1:point(x1,y1),control2:point(x2,y2),point:point(x,y)});current=[x,y];},
  quadraticCurveTo(x1,y1,x,y){ensure();push({op:'Q',control:point(x1,y1),point:point(x,y)});current=[x,y];},
  closePath(){if(current&&!closed){push({op:'Z'});current=origin;closed=true;}},
  rect(x,y,w,h){this.moveTo(x,y);this.lineTo(x+w,y);this.lineTo(x+w,y+h);this.lineTo(x,y+h);this.closePath();},
  arc(cx,cy,r,start,end,ccw=false){positive(r,'arc radius',true);finite(start,'arc start');finite(end,'arc end');finite(cx,'arc center.x');finite(cy,'arc center.y');const tau=2*Math.PI;let angle=end-start;if(Math.abs(angle)>=tau)angle=ccw?-tau:tau;else if(ccw&&angle>0)angle-=tau;else if(!ccw&&angle<0)angle+=tau;
   const first:[number,number]=[cx+r*Math.cos(start),cy+r*Math.sin(start)];if(!current)this.moveTo(...first);else if(Math.hypot(current[0]-first[0],current[1]-first[1])>Number.EPSILON*Math.max(1,r,Math.abs(cx),Math.abs(cy))*8)this.lineTo(...first);if(!angle||!r)return;
   const norm=Math.hypot(...matrix.slice(0,4)),step=(384*tolerance/(Math.SQRT2*norm*r))**.25,count=Math.ceil(Math.abs(angle)/step);if(!Number.isSafeInteger(count)||count<1||commands.length+count>Math.min(limit,graphics.LIMITS.commands))throw new EngineError('E_GRAPHICS_LIMIT','Arc accuracy requires more representable commands than the existing/caller policy',{details:{count,tolerance}});
   for(let i=0;i<count;i++){check();const a=start+angle*i/count,b=start+angle*(i+1)/count,d=(b-a)/3;this.bezierCurveTo(cx+r*(Math.cos(a)-d*Math.sin(a)),cy+r*(Math.sin(a)+d*Math.cos(a)),cx+r*(Math.cos(b)+d*Math.sin(b)),cy+r*(Math.sin(b)-d*Math.cos(b)),cx+r*Math.cos(b),cy+r*Math.sin(b));}
  },
 };
 return {context,finish():PathData|null{check();if(forceClose)context.closePath();if(!commands.length)return null;return graphics.validatePathData({schema:'frameweave.path',version:1,id:options.id??'pa.author.path',...options.label?{label:options.label}:{},coordinates:coords,fillRule:options.fillRule??'nonzero',commands});}};
}
export function localFrame(environment:PathEnvironment,center:Point|undefined,context:FrameContext|undefined,rotation:Scalar=0,scale:readonly [number,number]=[1,1]):[number,number,number,number,number,number]{const p=xy(center??[environment.width/2,environment.height/2],context,'center'),a=scalar(rotation,context,'rotation'),c=Math.cos(a),s=Math.sin(a);return [c*scale[0],s*scale[0],-s*scale[1],c*scale[1],p[0],p[1]];}
