// SPDX-License-Identifier: Apache-2.0
import {EngineError} from '../../src/core/errors.ts';
import {evaluate} from '../../src/core/animation.ts';
import {transformPixels} from '../../src/media/color.ts';import {srgb,linear709} from '../../src/media/surface.ts';
import {creationColor} from '../spatial-creation/colors.ts';
import type {Node2D,GroupNode,ShapeNode,ImageNode,TextNode,Paint,GradientStop,Matrix2D,Transform2D,Bounds2D,FrameContext,Signal} from './types.ts';
export const identity2D:Matrix2D=Object.freeze([1,0,0,1,0,0]);
export function error2D(code:string,message:string,id?:string):never{throw new EngineError(code,message,{details:id?{node:id}:undefined});}
export function number2D(v:Signal<number>,c:FrameContext|undefined,name:string,min=-Infinity,max=Infinity){if(typeof v!=='number'&&!c)error2D('E_NATIVE_2D_TIME','A real FrameContext is required for animated '+name);const n=typeof v==='number'?v:evaluate(v,c!);if(typeof n!=='number'||!Number.isFinite(n)||n<min||n>max)error2D('E_NATIVE_2D_PARAMETER',name+' must evaluate to a finite number in ['+min+','+max+']');return n;}
export function multiply2D(a:Matrix2D,b:Matrix2D):Matrix2D{return[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];}
export function inverse2D(m:Matrix2D):Matrix2D{const d=m[0]*m[3]-m[1]*m[2];if(!Number.isFinite(d)||d===0)error2D('E_NATIVE_2D_TRANSFORM','Invertible affine transform required');return[m[3]/d,-m[1]/d,-m[2]/d,m[0]/d,(m[2]*m[5]-m[3]*m[4])/d,(m[1]*m[4]-m[0]*m[5])/d];}
export function point2D(m:Matrix2D,x:number,y:number):readonly[number,number]{return[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];}
export function transform2D(o:Transform2D,c:FrameContext|undefined):Matrix2D{const angle=number2D(o.rotation??0,c,'rotation')*Math.PI/180,sx=number2D(o.scaleX??1,c,'scaleX'),sy=number2D(o.scaleY??1,c,'scaleY'),cos=Math.cos(angle),sin=Math.sin(angle),a=cos*sx,b=sin*sx,cc=-sin*sy,d=cos*sy,ax=number2D(o.anchor?.[0]??0,c,'anchor.x'),ay=number2D(o.anchor?.[1]??0,c,'anchor.y'),x=number2D(o.x??0,c,'x')+ax-a*ax-cc*ay,y=number2D(o.y??0,c,'y')+ay-b*ax-d*ay,m=multiply2D([a,b,cc,d,x,y],o.matrix??identity2D);if(m.some(v=>!Number.isFinite(v)))error2D('E_NATIVE_2D_TRANSFORM','Finite affine matrix required');return m;}
export function transformBounds2D(b:Bounds2D,m:Matrix2D):Bounds2D{const p=[[b.left,b.top],[b.right,b.top],[b.right,b.bottom],[b.left,b.bottom]].map(([x,y])=>point2D(m,x,y));return{left:Math.min(...p.map(v=>v[0])),top:Math.min(...p.map(v=>v[1])),right:Math.max(...p.map(v=>v[0])),bottom:Math.max(...p.map(v=>v[1]))};}
function node<T extends Node2D>(value:T):T{if(typeof value.id!=='string'||!value.id||value.id.includes('\0'))error2D('E_NATIVE_2D_ID','Stable nonempty node ID required');return structuredClone(value);}
export function group(o:Omit<GroupNode,'kind'>):GroupNode{return node({kind:'group',...o});}
export function rect(o:Omit<ShapeNode,'kind'|'shape'>&{width:Signal<number>;height:Signal<number>;radius?:Signal<number>}):ShapeNode{const{width,height,radius,...common}=o;return node({kind:'shape',...common,shape:{kind:'rect',width,height,radius}});}
export function ellipse(o:Omit<ShapeNode,'kind'|'shape'>&{radius:import('./types.ts').AnimatedPoint}):ShapeNode{const{radius,...common}=o;return node({kind:'shape',...common,shape:{kind:'ellipse',radius}});}
export function path(o:Omit<ShapeNode,'kind'|'shape'>&{data:import('./types.ts').PathData}):ShapeNode{const{data,...common}=o;return node({kind:'shape',...common,shape:{kind:'path',data}});}
export function image(o:Omit<ImageNode,'kind'>):ImageNode{return node({kind:'image',...o});}
export function text(o:Omit<TextNode,'kind'|'font'>&{font?:string}):TextNode{return node({kind:'text',...o,font:o.font??'default'});}
export function solid(color:SolidColor,opacity?:Signal<number>):Paint{return{kind:'solid',color:structuredClone(color),opacity};}
type SolidColor=import('../spatial-creation/colors.ts').CreationColor;
export function linearGradient(from:import('./types.ts').AnimatedPoint,to:import('./types.ts').AnimatedPoint,stops:readonly GradientStop[],spread:'pad'|'repeat'|'reflect'='pad'):Paint{return structuredClone({kind:'linear',from,to,stops,spread});}
export function radialGradient(center:import('./types.ts').AnimatedPoint,radius:import('./types.ts').AnimatedPoint,stops:readonly GradientStop[],spread:'pad'|'repeat'|'reflect'='pad'):Paint{return structuredClone({kind:'radial',center,radius,stops,spread});}
export function samplePaint(p:Paint,c:FrameContext){
 const color=(value:SolidColor,opacity:Signal<number>=1,mode='linear-premultiplied')=>{
  const alpha=number2D(opacity,c,'paint opacity',0,1),rgb=creationColor(value,c,'paint color');
  if(mode==='srgb-straight'){const encoded=transformPixels(Float32Array.of(...rgb,alpha),linear709,srgb,'straight').pixels;return[encoded[0],encoded[1],encoded[2],alpha] as [number,number,number,number];}
  return [...rgb.map(v=>mode==='linear-premultiplied'?v*alpha:v),alpha] as [number,number,number,number];
 };
 if('matrix'in p&&p.matrix){if(p.matrix.length!==6||p.matrix.some(v=>!Number.isFinite(v)))error2D('E_NATIVE_2D_PAINT','Finite six-component paint matrix required');inverse2D(p.matrix);}
 if(p.kind==='solid')return{kind:p.kind,stops:[{at:0,color:color(p.color,p.opacity)}]};
 const mode=p.interpolation??'linear-premultiplied';if(!['linear-premultiplied','linear-straight','srgb-straight'].includes(mode))error2D('E_NATIVE_2D_PAINT','Known gradient color/Alpha interpolation required');
 if(!['linear','radial'].includes(p.kind)||!['pad','repeat','reflect'].includes(p.spread??'pad')||!Array.isArray(p.stops)||p.stops.length<2)error2D('E_NATIVE_2D_PAINT','Known gradient/spread and two or more stops required');
 let last=-Infinity;const stops=p.stops.map(s=>{const at=number2D(s.at,c,'gradient stop',0,1);if(at<=last)error2D('E_NATIVE_2D_PAINT','Strictly increasing gradient stops required');last=at;return{at,color:color(s.color,s.opacity,mode)};});
 const xy=(v:import('./types.ts').AnimatedPoint)=>v.map((v,i)=>number2D(v,c,'gradient coordinate'+i));
 return p.kind==='linear'?{kind:p.kind,stops,spread:p.spread??'pad',interpolation:mode,matrix:p.matrix,from:xy(p.from),to:xy(p.to)}:{kind:p.kind,stops,spread:p.spread??'pad',interpolation:mode,matrix:p.matrix,center:xy(p.center),radius:xy(p.radius)};
}
/** Identity traversal only. Work is bounded by caller bytes, not an arbitrary node count. */
export function indexTree(root:Node2D,maxBytes=64*1024**2){if(!Number.isFinite(maxBytes)||maxBytes<1)error2D('E_NATIVE_2D_BUDGET','Positive byte budget required');let descriptorBytes=0;const values:unknown[]=[root],seen=new Set<object>();while(values.length){const v=values.pop();descriptorBytes+=typeof v==='string'?v.length*2+16:16;if(descriptorBytes>maxBytes)error2D('E_NATIVE_2D_BUDGET','Object data exceed configured byte plan');if(!v||typeof v!=='object'||seen.has(v))continue;seen.add(v);for(const k of Reflect.ownKeys(v)){const d=Object.getOwnPropertyDescriptor(v,k)!;if(typeof k!=='string'||!('value'in d))error2D('E_NATIVE_2D_PARAMETER','Plain enumerable data required');descriptorBytes+=k.length*2;values.push(d.value);}}const byId=new Map<string,Node2D>(),parent=new Map<string,string|null>(),stack:[Node2D,string|null][]=[[root,null]];let bytes=0;while(stack.length){const[n,p]=stack.pop()!;if(!n||typeof n.id!=='string'||!n.id||byId.has(n.id))error2D('E_NATIVE_2D_ID','Cycle, repeated object or duplicate node ID: '+n?.id,n?.id);if(!['group','shape','image','text'].includes(n.kind))error2D('E_NATIVE_2D_NODE','Known shared node kind required',n.id);bytes+=n.id.length*2+256;if(bytes>maxBytes)error2D('E_NATIVE_2D_BUDGET','Object descriptors exceed configured byte plan');byId.set(n.id,n);parent.set(n.id,p);if(n.kind==='group'){if(!Array.isArray(n.children))error2D('E_NATIVE_2D_NODE','Group children must be an array',n.id);for(let i=n.children.length-1;i>=0;i--)stack.push([n.children[i],n.id]);}}return{byId,parent,descriptorBytes};}
