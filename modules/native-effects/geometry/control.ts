import {EngineError} from '../../../src/core/errors.ts';
export const fail=(message:string):never=>{throw new EngineError('E_NATIVE_GEOMETRY_PARAMETER',message);};
export const split=(v:number):[number,number]=>{const h=Math.fround(v);if(!Number.isFinite(h))fail('Control exceeds finite Float32 range');return [h,Math.fround(v-h)];};
export type XY=readonly [number,number];
export interface AxisPlan {indices:Uint32Array;weights:Float32Array}
const sinc=(x:number)=>x===0?1:Math.sin(Math.PI*x)/(Math.PI*x);
/** Mitchell-Netravali B=C=1/3, Lanczos3 and triangle, in F64 control space. */
export function reconstruction(x:number,method:'nearest'|'triangle'|'mitchell'|'lanczos3'){
 const a=Math.abs(x);if(method==='nearest')return a<.5?1:0;
 if(method==='triangle')return Math.max(0,1-a);
 if(method==='lanczos3')return a<3?sinc(a)*sinc(a/3):0;
 if(a<1)return (7*a*a*a-12*a*a+16/3)/6;
 return a<2?(-7/3*a*a*a+12*a*a-20*a+32/3)/6:0;
}
export function axisPlan(source:number,target:number,method:'nearest'|'triangle'|'mitchell'|'lanczos3',antialias:boolean):AxisPlan {
 const header:number[]=Array(target*2).fill(0),entries:number[]=[],weights:number[]=[],scale=method==='nearest'?1:antialias?Math.max(1,source/target):1,support=({nearest:.5,triangle:1,mitchell:2,lanczos3:3}[method])*scale;
 for(let x=0;x<target;x++){
  const centre=(x+.5)*source/target-.5,first=method==='nearest'?Math.floor(centre+.5):Math.ceil(centre-support),last=method==='nearest'?first:Math.floor(centre+support),values:number[]=[];
  for(let i=first;i<=last;i++)values.push(method==='nearest'?1:reconstruction((i-centre)/scale,method));
  const sum=values.reduce((a,b)=>a+b,0);if(!Number.isFinite(sum)||sum===0)fail('Degenerate reconstruction kernel');
  header[x*2]=target*2+entries.length;header[x*2+1]=values.length;
  for(let i=0;i<values.length;i++){entries.push((first+i)>>>0);weights.push(...split(values[i]/sum));}
 }
 if(header.length+entries.length>0xffffffff||weights.length>0xffffffff)fail('Resampling controls exceed uint32 addressing');
 return {indices:Uint32Array.from([...header,...entries]),weights:Float32Array.from(weights)};
}
/** Scaled partial-pivot solve; singular and non-finite projects fail explicitly. */
export function solve(matrix:readonly number[][],values:readonly number[]):number[]{
 const n=values.length,a=matrix.map((row,i)=>[...row,values[i]]);
 for(let k=0;k<n;k++){
  let pivot=k,best=-1;for(let i=k;i<n;i++){const scale=Math.max(...a[i].slice(0,n).map(Math.abs)),score=scale===0?0:Math.abs(a[i][k])/scale;if(score>best){best=score;pivot=i;}}
  if(best<1e-14)fail('Singular or ill-conditioned geometric transform');[a[k],a[pivot]]=[a[pivot],a[k]];
  const d=a[k][k];for(let j=k;j<=n;j++)a[k][j]/=d;
  for(let i=0;i<n;i++)if(i!==k){const f=a[i][k];for(let j=k;j<=n;j++)a[i][j]-=f*a[k][j];}
 }
 const result=a.map(row=>row[n]);if(result.some(v=>!Number.isFinite(v)))fail('Non-finite transform coefficients');return result;
}
export function pinMatrix(corners:readonly XY[],width:number,height:number):number[]{
 const source:XY[]=[[0,0],[width,0],[width,height],[0,height]],a:number[][]=[],b:number[]=[];
 corners.forEach(([x,y],i)=>{const [u,v]=source[i];a.push([x,y,1,0,0,0,-u*x,-u*y],[0,0,0,x,y,1,-v*x,-v*y]);b.push(u,v);});return [...solve(a,b),1];
}
/** Homogeneous scale has no geometric meaning. Normalize before determinant
 * and pole checks so 1e-20*identity has exactly the identity sampling contract. */
export function normalizedHomography(matrix:readonly number[]):number[]{
 const scale=Math.max(...matrix.map(Math.abs));if(!Number.isFinite(scale)||scale===0)fail('Singular homography');const m=matrix.map(v=>v/scale),det=m[0]*(m[4]*m[8]-m[5]*m[7])-m[1]*(m[3]*m[8]-m[5]*m[6])+m[2]*(m[3]*m[7]-m[4]*m[6]);if(!Number.isFinite(det)||det===0)fail('Singular homography');return m;
}
export interface TrianglePlan {rows:Uint32Array;coefficients:Float32Array}
/** EffectCraft grid_warp row buckets + inverse barycentric preparation. CPU
 * work is geometry only, never a dense per-pixel displacement image. */
export function triangles(columns:number,rows:number,destination:readonly XY[],source:readonly XY[],height:number):TrianglePlan {
 const buckets:number[][]=Array.from({length:height},()=>[]),data:number[]=[];
 for(let j=0;j<rows;j++)for(let i=0;i<columns;i++){
  const a=j*(columns+1)+i,b=a+1,c=b+columns+1,d=a+columns+1;
  for(const ids of [[a,b,c],[a,c,d]]){
   const [p,q,r]=ids.map(k=>destination[k]),den=(q[1]-r[1])*(p[0]-r[0])+(r[0]-q[0])*(p[1]-r[1]);
   if(Math.abs(den)<1e-12)continue;
   const coefficients=[(q[1]-r[1])/den,(r[0]-q[0])/den,((q[0]-r[0])*r[1]-(q[1]-r[1])*r[0])/den,(r[1]-p[1])/den,(p[0]-r[0])/den,((p[1]-r[1])*r[0]-(p[0]-r[0])*r[1])/den,...ids.flatMap(k=>source[k])],index=data.length/24;
   data.push(...coefficients.flatMap(split));
   const first=Math.max(0,Math.floor(Math.min(p[1],q[1],r[1])-.5)),last=Math.min(height,Math.ceil(Math.max(p[1],q[1],r[1])+.5));
   for(let y=first;y<last;y++)buckets[y].push(index);
  }
 }
 const header:number[]=[],indices:number[]=[];for(const bucket of buckets){header.push(height*2+indices.length,bucket.length);indices.push(...bucket);}
 if(data.length>0xffffffff||header.length+indices.length>0xffffffff)fail('Geometry buffers exceed uint32 addressing');
 return {rows:Uint32Array.from([...header,...indices]),coefficients:Float32Array.from(data.length?data:[0,0])};
}
export function bezier(points:readonly XY[],t:number):XY {const u=1-t,w=[u*u*u,3*u*u*t,3*u*t*t,t*t*t];return [points.reduce((v,p,i)=>v+p[0]*w[i],0),points.reduce((v,p,i)=>v+p[1]*w[i],0)];}
