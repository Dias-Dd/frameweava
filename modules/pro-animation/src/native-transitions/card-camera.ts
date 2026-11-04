// Selected rotation / homogeneous projection equations adapted from EffectCraft
// card3d.rs @ec7ced1f0515f0b6f376dbcc297f1c441f452d6e (MIT).
// Focal distance is explicitly pixels here; no EffectCtx/Buf/editor is imported.
// Auto-focal estimation is independent; upstream's constant-70 shortcut is not used.
import {EngineError} from '../../../../src/core/errors.ts';
import {evaluate} from '../../../../src/core/animation.ts';
import type {FrameContext,Signal} from '../../../../src/core/types.ts';
import type {CardCamera} from './card-types.ts';
export function cardError(message:string):never{throw new EngineError('E_PA_CARD',message);}
export function cardFields(value:object,fields:readonly string[]){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!fields.includes(k)))cardError('Unknown card control field');}
export function cardScalar(value:Signal<number>|undefined,fallback:number,name:string,context?:FrameContext,min=-Infinity,max=Infinity){
 const raw=value??fallback;if(typeof raw!=='number'&&!context)cardError(name+': Signal requires FrameContext');const v=typeof raw==='number'?raw:evaluate(raw,context!);
 if(!Number.isFinite(v)||v<min||v>max||!Number.isFinite(Math.fround(v))||v!==0&&Math.abs(Math.fround(v))<2**-126)cardError(name+': finite representable control required');return v;
}
type M3=number[][];type P3=number[][];
const multiply=(a:M3,b:M3):M3=>a.map(row=>b[0].map((_,j)=>row.reduce((s,v,k)=>s+v*b[k][j],0)));
const identity=()=>[[1,0,0],[0,1,0],[0,0,1]];
export function cardRotation(x:number,y:number,z:number,order:string){
 const c=[Math.cos(x),Math.cos(y),Math.cos(z)],s=[Math.sin(x),Math.sin(y),Math.sin(z)],matrices:Record<string,M3>={X:[[1,0,0],[0,c[0],-s[0]],[0,s[0],c[0]]],Y:[[c[1],0,s[1]],[0,1,0],[-s[1],0,c[1]]],Z:[[c[2],-s[2],0],[s[2],c[2],0],[0,0,1]]};
 return [...order].reduce((m,a)=>multiply(matrices[a],m),identity());
}
const determinant=(m:M3)=>m[0][0]*(m[1][1]*m[2][2]-m[1][2]*m[2][1])-m[0][1]*(m[1][0]*m[2][2]-m[1][2]*m[2][0])+m[0][2]*(m[1][0]*m[2][1]-m[1][1]*m[2][0]);
function inverse(m:M3){const det=determinant(m);if(!Number.isFinite(det)||det===0)cardError('Degenerate card projection');return Array.from({length:3},(_,i)=>Array.from({length:3},(_,j)=>{const r=[0,1,2].filter(v=>v!==j),c=[0,1,2].filter(v=>v!==i);return (m[r[0]][c[0]]*m[r[1]][c[1]]-m[r[0]][c[1]]*m[r[1]][c[0]])*(i+j&1?-1:1)/det;}));}
/** Exact square-to-quad homography; degenerate/crossing input is rejected. */
export function cardHomography(quad:readonly (readonly number[])[]):M3{
 if(quad.length!==4||quad.some(p=>p.length!==2||p.some(v=>!Number.isFinite(v))))cardError('Four finite camera pins required');
 let sign=0;for(let i=0;i<4;i++){const a=quad[i],b=quad[(i+1)%4],c=quad[(i+2)%4],cross=(b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]);if(cross===0||sign&&Math.sign(cross)!==sign)cardError('Camera pins must form a strictly convex nondegenerate quadrilateral');sign=Math.sign(cross);}
 const [[x0,y0],[x1,y1],[x2,y2],[x3,y3]]=quad,dx1=x1-x2,dx2=x3-x2,dx3=x0-x1+x2-x3,dy1=y1-y2,dy2=y3-y2,dy3=y0-y1+y2-y3,det=dx1*dy2-dx2*dy1;
 if(det===0)cardError('Degenerate camera pins');const g=(dx3*dy2-dx2*dy3)/det,h=(dx1*dy3-dx3*dy1)/det;
 return [[x1-x0+g*x1,x3-x0+h*x3,x0],[y1-y0+g*y1,y3-y0+h*y3,y0],[g,h,1]];
}
/** Homogeneous pin calibration has an underdetermined frontal case. Use the
 * declared default there, never a previous render or neighbor-frame search. */
function autoFocal(h:M3,width:number,height:number,fallback:number){
 const x=[h[0][0]-width*.5*h[2][0],h[0][1]-width*.5*h[2][1]],y=[h[1][0]-height*.5*h[2][0],h[1][1]-height*.5*h[2][1]],a=h[2][0]*h[2][1],b=x[0]*x[1]+y[0]*y[1],c=h[2][0]**2-h[2][1]**2,d=x[0]**2+y[0]**2-x[1]**2-y[1]**2,den=a*a+c*c;
 if(den===0)return fallback;const f2=-(a*b+c*d)/den;if(!(f2>0)||!Number.isFinite(f2))cardError('Camera pins do not admit a finite positive auto focal estimate; specify focalLength with autoFocalLength:false');return Math.sqrt(f2);
}
export function cardProjection(camera:CardCamera|undefined,width:number,height:number,context?:FrameContext){
 const o=camera??{},n=(v:Signal<number>|undefined,d:number,k:string,min=-Infinity)=>cardScalar(v,d,k,context,min),tuple=(v:unknown,d:number[],k:string)=>{const a=v??d;if(!Array.isArray(a)||a.length!==d.length)cardError(k+': tuple length mismatch');return (a as Signal<number>[]).map((x,i)=>n(x,d[i],k+'.'+i));};
 const center=[width*.5,height*.5],size=Math.max(width,height);let near=size*.05,m:P3;
 const simple=(f:number,d:number):P3=>[[f,0,center[0],center[0]*(d-f)],[0,f,center[1],center[1]*(d-f)],[0,0,1,d]];
 if(o.system==='composition'){
  cardFields(o,['system','projection','near','eye']);if(!Array.isArray(o.projection)||o.projection.length!==12)cardError('Composition camera requires explicit X,Y,W homogeneous rows');m=Array.from({length:3},(_,i)=>o.projection.slice(i*4,i*4+4).map((v,j)=>n(v,0,'projection.'+(i*4+j))));near=n(o.near,near,'near',Number.MIN_VALUE);
 }else if(o.system==='corner-pins'){
  cardFields(o,['system','corners','autoFocalLength','focalLength']);if(!Array.isArray(o.corners)||o.corners.length!==4)cardError('Camera requires TL,TR,BR,BL pins');if(o.autoFocalLength!==undefined&&typeof o.autoFocalLength!=='boolean')cardError('autoFocalLength must be boolean');
  const q=o.corners.map((v,i)=>tuple(v,[0,0],'pin.'+i).map((v,k)=>v*[width,height][k])),unit=cardHomography(q),h=multiply(unit,[[1/width,0,0],[0,1/height,0],[0,0,1]]),fallback=n(o.focalLength,size*2,'focalLength',Number.MIN_VALUE),f=o.autoFocalLength===false?fallback:autoFocal(h,width,height,fallback);
  m=multiply(h,simple(f,f));near=f*.05;
 }else{
  if(o.system!==undefined&&o.system!=='position')cardError('Unknown camera system');cardFields(o,['system','position','rotationDegrees','depth','focalLength','transformOrder']);
  const p=tuple(o.position,[.5,.5],'camera.position').map((v,k)=>v*[width,height][k]),a=tuple(o.rotationDegrees,[0,0,0],'camera.rotation').map(v=>(v%360)*Math.PI/180),orders=['XYZ-position','XZY-position','YXZ-position','YZX-position','ZXY-position','ZYX-position','position-XYZ','position-XZY','position-YXZ','position-YZX','position-ZXY','position-ZYX'];
  if(o.transformOrder!==undefined&&!orders.includes(o.transformOrder))cardError('Unknown camera transform order');const order=o.transformOrder??orders[0],r=cardRotation(a[0],a[1],a[2],order.replace('position','').replace('-','')),shift=[p[0]-center[0],p[1]-center[1],0],c=[...center,0],t=c.map((v,i)=>v-r[i].reduce((s,v,k)=>s+v*c[k],0)+(order.startsWith('position')?r[i].reduce((s,v,k)=>s+v*shift[k],0):shift[i]));
  const d=n(o.depth,size*2,'camera.depth',Number.MIN_VALUE),f=n(o.focalLength,size*2,'camera.focalLength',Number.MIN_VALUE),base=simple(f,d);m=base.map(row=>[...r[0].map((_,j)=>row.slice(0,3).reduce((s,v,k)=>s+v*r[k][j],0)),row.slice(0,3).reduce((s,v,k)=>s+v*t[k],row[3])]);near=d*.05;
 }
 const a=m.map(row=>row.slice(0,3)),b=m.map(row=>-row[3]);let eye:number[];
 if(camera?.system==='composition'&&camera.eye)eye=tuple(camera.eye,[center[0],center[1],-size*2],'camera.eye');else if(determinant(a)!==0)eye=inverse(a).map(row=>row.reduce((s,v,k)=>s+v*b[k],0));else eye=[center[0],center[1],-1e9];
 const rows=[m[0].map((v,k)=>2*v/width-m[2][k]),m[1].map((v,k)=>m[2][k]-2*v/height),m[2].map((v,k)=>v-(k===3?near:0)),m[2]],matrix=Array.from({length:16},(_,i)=>rows[i%4][Math.floor(i/4)]);
 if([...matrix,...eye,near].some(v=>!Number.isFinite(v)||!Number.isFinite(Math.fround(v))))cardError('Camera exceeds finite GPU projection representation');return {matrix,eye,near,projection:m};
}
