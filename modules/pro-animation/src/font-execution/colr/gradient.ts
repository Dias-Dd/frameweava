// SPDX-License-Identifier: Apache-2.0
// Numeric control/reference for original Skrifa brush callbacks. No CPU image execution.
import {EngineError} from '../../../../../src/core/errors.ts';
import type {ColorPaintEvent,ColorStop} from '../kernel.ts';
import type {GlyphRgba} from '../../text-styling/ink.ts';
export type ColrGradient=Extract<ColorPaintEvent,{op:'linear'|'radial'|'sweep'}>;
export interface ColrColorLine {readonly extend:'pad'|'repeat'|'reflect';readonly stops:readonly {at:number;color:GlyphRgba}[]}
export type ColrAffine=readonly [number,number,number,number,number,number];
export const identity:ColrAffine=[1,0,0,1,0,0];
const bad=(m:string):never=>{throw new EngineError('E_PA_COLR_PAINT',m);};
export function compose(a:ColrAffine,b:ColrAffine):ColrAffine{return [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];}
export function invert(a:ColrAffine):ColrAffine|null{if(a.length!==6||a.some(v=>!Number.isFinite(v)))bad('Six finite affine coefficients required');const d=a[0]*a[3]-a[1]*a[2];if(d===0)return null;const out=[a[3]/d,-a[1]/d,-a[2]/d,a[0]/d,(a[2]*a[5]-a[3]*a[4])/d,(a[1]*a[4]-a[0]*a[5])/d] as const;if(out.some(v=>!Number.isFinite(v)))bad('Affine inverse exceeds Float64 coordinate domain');return out;}
export function resolveColrColorLine(stops:readonly ColorStop[],extend:ColrColorLine['extend'],resolve:(index:number,alpha:number)=>GlyphRgba):ColrColorLine{
 if(!['pad','repeat','reflect'].includes(extend))bad('Known original extend mode required');
 return {extend,stops:stops.map((s,i)=>{if(!Number.isFinite(s.at)||i&&s.at<stops[i-1].at)bad('Stable original normalized stop ordering required');const c=resolve(s.paletteIndex,s.alpha);return {at:s.at,color:[c[0]*c[3],c[1]*c[3],c[2]*c[3],c[3]]};})};
}
/** Independent scalar oracle; production pixels are exclusively Native GPU. */
export function sampleColrColorLine(line:ColrColorLine,parameter:number):GlyphRgba{
 const s=line.stops,n=s.length;if(!n)return [0,0,0,0];if(n===1)return s[0].color;let t=parameter,lo=s[0].at,hi=s[n-1].at;
 if(!Number.isFinite(t))bad('Finite color-line parameter required');
 if(line.extend!=='pad'){
  const width=hi-lo;if(width===0)return [0,0,0,0];
  if(t<lo||t>hi){const cycle=Math.floor((t-lo)/width),f=(t-lo)-cycle*width;if(line.extend==='repeat')t=t>hi&&f===0?hi:lo+f;else t=Math.abs(cycle%2)===1?hi-f:lo+f;}
 }
 if(t<lo)return s[0].color;if(t>=hi)return s[n-1].color;
 let left=0,right=n;while(left<right){const mid=left+Math.floor((right-left)/2);if(s[mid].at<=t)left=mid+1;else right=mid;}const a=s[left-1],b=s[left],f=(t-a.at)/(b.at-a.at);return a.color.map((v,k)=>v*(1-f)+b.color[k]*f) as unknown as GlyphRgba;
}
/** Greatest real two-circle root with positive interpolated radius, matching COLR paint order. */
export function radialParameter(g:readonly number[],x:number,y:number):number|null{
 const [cx,cy,r0,ex,ey,r1]=g,dx=ex-cx,dy=ey-cy,dr=r1-r0,qx=x-cx,qy=y-cy;
 if(cx===ex&&cy===ey&&r0===r1||r0===0&&r1===0)return null;
 const a=dx*dx+dy*dy-dr*dr,b=-2*(qx*dx+qy*dy+r0*dr),c=qx*qx+qy*qy-r0*r0;
 let roots:number[];if(a===0){if(b===0)return null;roots=[-c/b];}else{const d=b*b-4*a*c;if(d<0)return null;const q=-.5*(b+(b<0?-1:1)*Math.sqrt(d));roots=q===0?[-b/(2*a)]:[q/a,c/q];}
 const valid=roots.filter(t=>Number.isFinite(t)&&r0+dr*t>0);return valid.length?Math.max(...valid):null;
}
export function sampleColrGradient(brush:ColrGradient,line:ColrColorLine,x:number,y:number):GlyphRgba{
 const g=brush.geometry;let t:number|null;
 if(brush.op==='linear'){const dx=g[2]-g[0],dy=g[3]-g[1],d=dx*dx+dy*dy;if(d===0)return [0,0,0,0];t=((x-g[0])*dx+(y-g[1])*dy)/d;}
 else if(brush.op==='radial')t=radialParameter(g,x,y);
 else{let a=Math.atan2(-(y-g[1]),x-g[0])*180/Math.PI;if(a<0)a+=360;if(a===360)a=0;const span=g[3]-g[2];if(span===0){if(line.extend!=='pad')return [0,0,0,0];return a<=g[2]?line.stops[0]?.color??[0,0,0,0]:line.stops.at(-1)?.color??[0,0,0,0];}t=(a-g[2])/span;}
 return t===null?[0,0,0,0]:sampleColrColorLine(line,t);
}
