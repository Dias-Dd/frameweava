/** Offline oracle: dense forward-scatter matrix, not the production preimage
 * gather or shader loops. Never imported by the runtime effect. */
import type {Boundary,PsfGridV1} from './types.ts';
export type Matrix=Float64Array[];
export function denseOperator(grid:PsfGridV1,w:number,h:number,boundary:Boundary):Matrix{
 const n=w*h,rows=Array.from({length:n},()=>new Float64Array(n)),kernels=grid.kernels.map(k=>{const scale=Math.max(...k),total=k.reduce((s,x)=>s+x/scale,0);return k.map(x=>x/scale/total);});
 const axis=(v:number,size:number)=>{if(boundary==='zero')return v<0||v>=size?-1:v;if(boundary==='clamp')return Math.max(0,Math.min(size-1,v));if(boundary==='wrap')return (v%size+size)%size;if(size===1)return 0;const p=2*(size-1),x=(v%p+p)%p;return Math.min(x,p-x);};
 function coefficient(x:number,y:number,k:number){
  const gx=w===1?0:x*(grid.columns-1)/(w-1),gy=h===1?0:y*(grid.rows-1)/(h-1),ix=Math.floor(gx),iy=Math.floor(gy),fx=gx-ix,fy=gy-iy;
  const ids=[iy*grid.columns+ix,iy*grid.columns+Math.min(ix+1,grid.columns-1),Math.min(iy+1,grid.rows-1)*grid.columns+ix,Math.min(iy+1,grid.rows-1)*grid.columns+Math.min(ix+1,grid.columns-1)],weights=[(1-fx)*(1-fy),fx*(1-fy),(1-fx)*fy,fx*fy];
  return ids.reduce((s,id,j)=>s+weights[j]*kernels[id][k],0);
 }
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  for(let ky=0;ky<grid.kernelHeight;ky++)for(let kx=0;kx<grid.kernelWidth;kx++){
   const xx=axis(x-(kx-Math.floor(grid.kernelWidth/2)),w),yy=axis(y-(ky-Math.floor(grid.kernelHeight/2)),h);if(xx<0||yy<0)continue;const k=ky*grid.kernelWidth+kx;rows[y*w+x][yy*w+xx]+=grid.anchor==='input'?coefficient(xx,yy,k):coefficient(x,y,k);
  }
 }return rows;
}
export function apply(a:Matrix,input:ArrayLike<number>,transpose=false,round=true){const n=a.length,out=new Float64Array(n*4);for(let i=0;i<n;i++)for(let j=0;j<n;j++){const coefficient=transpose?a[j][i]:a[i][j];for(let c=0;c<4;c++)out[i*4+c]+=coefficient*input[j*4+c];}return round?Float32Array.from(out):out;}
export function associate(raw:Float32Array,alpha:'straight'|'premultiplied'|'opaque'){return Float32Array.from(raw,(x,i)=>i%4!==3&&alpha==='straight'?x*raw[i-i%4+3]:x);}
export interface ReferenceObservation{matrix:Matrix;image:Float32Array;weight:number;mask?:Float32Array}
export function solveReference(prior:Float32Array,observations:readonly ReferenceObservation[],w:number,h:number,iterations:number,step=1,ridge=1e-4,smoothness=0,restoreAlpha=false){
 const n=w*h,weighted=(x:ArrayLike<number>,o:ReferenceObservation)=>Float32Array.from(x,(v,i)=>v*(o.mask?.[Math.floor(i/4)*4+3]??1)),ones=new Float32Array(n*4).fill(1),rhs=new Float32Array(n*4),diagonal=new Float32Array(n*4),total=observations.reduce((s,x)=>s+x.weight,0),accumulate=(out:Float32Array,input:ArrayLike<number>,weight:number)=>{for(let j=0;j<out.length;j++)out[j]=out[j]+input[j]*weight;};
 for(const o of observations){const beta=o.weight/total;accumulate(rhs,apply(o.matrix,weighted(o.image,o),true),beta);accumulate(diagonal,apply(o.matrix,weighted(apply(o.matrix,ones),o),true),beta);}
 const history=[Float32Array.from(prior)];
 for(let iteration=0;iteration<iterations;iteration++){
  const old=history.at(-1)!,normal=new Float32Array(n*4);for(const o of observations)accumulate(normal,apply(o.matrix,weighted(apply(o.matrix,old),o),true),o.weight/total);
  const next=Float32Array.from(old),at=(x:number,y:number,c:number)=>old[(Math.max(0,Math.min(h-1,y))*w+Math.max(0,Math.min(w-1,x)))*4+c];
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)for(let c=0;c<4;c++){const i=(y*w+x)*4+c;if(c===3&&!restoreAlpha){next[i]=prior[i];continue;}const lap=at(x+1,y,c)+at(x-1,y,c)+at(x,y+1,c)+at(x,y-1,c)-4*old[i],d=diagonal[i]+ridge+8*smoothness;next[i]=d>0?old[i]+step*(rhs[i]-normal[i]+ridge*(prior[i]-old[i])+smoothness*lap)/d:old[i];if(c===3)next[i]=Math.max(0,Math.min(1,next[i]));}
  history.push(next);
 }return {history,diagonal,rhs};
}
export function objective(value:Float32Array,prior:Float32Array,observations:readonly ReferenceObservation[],w:number,h:number,ridge:number,smoothness:number,restoreAlpha:boolean){const total=observations.reduce((s,x)=>s+x.weight,0);let sum=0;for(const o of observations){const y=apply(o.matrix,value,false,false);for(let i=0;i<value.length;i++){if(i%4===3&&!restoreAlpha)continue;const d=y[i]-o.image[i];sum+=.5*(o.weight/total)*(o.mask?.[Math.floor(i/4)*4+3]??1)*d*d;}}for(let y=0;y<h;y++)for(let x=0;x<w;x++)for(let c=0;c<(restoreAlpha?4:3);c++){const i=(y*w+x)*4+c,d=value[i]-prior[i];sum+=.5*ridge*d*d;if(x+1<w)sum+=.5*smoothness*(value[i+4]-value[i])**2;if(y+1<h)sum+=.5*smoothness*(value[i+w*4]-value[i])**2;}return sum;}
