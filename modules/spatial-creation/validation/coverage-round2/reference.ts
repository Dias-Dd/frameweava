/** Independent scalar F64 sampling/property/coverage references, TEST ONLY. */
import {positions,velocities,config} from './cases.ts';
export function reference(frame:number,pixels:ArrayLike<number>){
 const {rules,sampling:o,integrate}=config(frame),state=positions.flatMap((_,i)=>i%3?[]:[positions[i]+(integrate?velocities[i]*.1:0),positions[i+1]+(integrate?velocities[i+1]*.1:0),positions[i+2]+(integrate?velocities[i+2]*.1:0),Math.fround(.08),Math.fround(velocities[i]),Math.fround(velocities[i+1]),Math.fround(velocities[i+2]),Math.fround(.6),Math.fround(1.2),Math.fround(.6),Math.fround(.2),0]),base=[...state];
 const index:any={positionX:0,positionY:1,positionZ:2,radius:3,velocityX:4,velocityY:5,velocityZ:6,alpha:7,red:8,green:9,blue:10};
 const tap=(x:number,y:number):number[]=>{if(o.boundary==='zero'&&(x<0||x>=2||y<0||y>=2))return [0,0,0,0];if(o.boundary==='repeat'){x=(x%2+2)%2;y=(y%2+2)%2;}else{x=Math.max(0,Math.min(1,x));y=Math.max(0,Math.min(1,y));}return Array.from({length:4},(_,k)=>pixels[(y*2+x)*4+k]);};
 for(let particle=0;particle<6;particle++){
  const at=particle*12,axes=o.axes==='xz'?[0,2]:o.axes==='yz'?[1,2]:[0,1],x=o.at==='birth'?positions[particle*3+axes[0]]:base[at+axes[0]],y=o.at==='birth'?positions[particle*3+axes[1]]:base[at+axes[1]],u=(x+1)/2,v=(1-y)/2;if((u<0||u>1||v<0||v>1)&&(o.boundary??'ignore')==='ignore')continue;
  let rgba:number[];if(o.sampling==='linear'){const xx=u*2-.5,yy=v*2-.5,a=Math.floor(xx),b=Math.floor(yy),tx=xx-a,ty=yy-b,A=tap(a,b),B=tap(a+1,b),C=tap(a,b+1),D=tap(a+1,b+1);rgba=A.map((_,k)=>(A[k]*(1-tx)+B[k]*tx)*(1-ty)+(C[k]*(1-tx)+D[k]*tx)*ty);}else rgba=tap(Math.floor(u*2),Math.floor(v*2));
  if(rgba[3]>0)for(let k=0;k<3;k++)rgba[k]/=rgba[3];else rgba=[0,0,0,0];
  for(const r of rules){let x=r.channel==='luma'?.2126*rgba[0]+.7152*rgba[1]+.0722*rgba[2]:rgba[['r','g','b','a'].indexOf(r.channel??'r')];if(r.clampInput!==false)x=Math.max(0,Math.min(1,x));const low=(r.range?.[0]??0) as number,high=(r.range?.[1]??1) as number,target=index[r.property],old=state[at+target];let value=low+(high-low)*x;if(r.operation==='add')value+=old;if(r.operation==='multiply')value*=old;state[at+target]=old+(value-old)*((r.strength??1) as number)*(o.alphaWeight?rgba[3]:1);if(target===3)state[at+target]=Math.max(0,state[at+target]);if(target===7)state[at+target]=Math.max(0,Math.min(1,state[at+target]));}
 }
 return {state,base};
}
export function billboardReference(state:ArrayLike<number>){
 const out=new Float64Array(96*64*4),order=Array.from({length:6},(_,i)=>i).sort((a,b)=>state[a*12+2]-state[b*12+2]||a-b);
 for(let y=0;y<64;y++)for(let x=0;x<96;x++){
  const at=(y*96+x)*4;for(const p of order){const i=p*12,depth=5-state[i+2];if(depth<.01||depth>100)continue;const radius=state[i+3]*32;if(radius<=0)continue;const d=Math.hypot(x+.5-(48+32*state[i]),y+.5-(32-32*state[i+1])),a=Math.max(0,radius-.75),b=radius+.75,t=Math.max(0,Math.min(1,(d-a)/(b-a))),alpha=(1-t*t*(3-2*t))*state[i+7];for(let k=0;k<3;k++)out[at+k]=state[i+8+k]*alpha+out[at+k]*(1-alpha);out[at+3]=alpha+out[at+3]*(1-alpha);}
 }return out;
}
