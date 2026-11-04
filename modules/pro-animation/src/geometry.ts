// De Casteljau split/evaluation and normalized positional matching adapted from
// EffectCraft path/interp.rs @861c51f8187bf56efc77cc7b60fc4a513d2b7198 (MIT).
// Copyright (c) 2026 ArtCraft Team and contributors. See vendor/effectcraft.
export type XY=[number,number];
export type Cubic=[XY,XY,XY,XY];
export const lerpPoint=(a:XY,b:XY,t:number):XY=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
export function cubicPoint(c:Cubic,t:number):XY {const u=1-t,a=u*u*u,b=3*u*u*t,d=3*u*t*t,e=t*t*t;return [a*c[0][0]+b*c[1][0]+d*c[2][0]+e*c[3][0],a*c[0][1]+b*c[1][1]+d*c[2][1]+e*c[3][1]];}
export function splitCubic(c:Cubic,t:number):[Cubic,Cubic]{
 const p01=lerpPoint(c[0],c[1],t),p12=lerpPoint(c[1],c[2],t),p23=lerpPoint(c[2],c[3],t),a=lerpPoint(p01,p12,t),b=lerpPoint(p12,p23,t),m=lerpPoint(a,b,t);
 return [[c[0],p01,a,m],[m,b,p23,c[3]]];
}
export function cubicPart(c:Cubic,a:number,b:number):Cubic {if(a===0&&b===1)return c;const left=b===1?c:splitCubic(c,b)[0];return a===0?left:splitCubic(left,a/b)[1];}
export const distance=(a:XY,b:XY)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
/** Chord <= Bezier length <= control polygon, ignoring ordinary F64 roundoff. */
export function lengthBounds(c:Cubic){const lower=distance(c[0],c[3]),upper=distance(c[0],c[1])+distance(c[1],c[2])+distance(c[2],c[3]);return {length:(lower+upper)/2,error:Math.max(0,upper-lower)/2};}
export function normalizedFrame(v:XY[]):{center:XY;radius:number}{const n=Math.max(1,v.length),center:XY=[v.reduce((s,p)=>s+p[0],0)/n,v.reduce((s,p)=>s+p[1],0)/n],radius=Math.max(1e-9,Math.sqrt(v.reduce((s,p)=>s+(p[0]-center[0])**2+(p[1]-center[1])**2,0)/n));return {center,radius};}
/** Upstream cost with shape-context histogram term disabled; no claimed full correspond/Procrustes parity. */
export function correspondenceCost(a:XY[],b:XY[],offset:number){const fa=normalizedFrame(a),fb=normalizedFrame(b);let sum=0;for(let i=0;i<a.length;i++){const p=a[i],q=b[(i+offset)%b.length];sum+=((p[0]-fa.center[0])/fa.radius-(q[0]-fb.center[0])/fb.radius)**2+((p[1]-fa.center[1])/fa.radius-(q[1]-fb.center[1])/fb.radius)**2;}return sum/a.length;}
export function signedArea(points:XY[]){return points.reduce((a,p,i)=>{const q=points[(i+1)%points.length];return a+p[0]*q[1]-q[0]*p[1];},0)/2;}
