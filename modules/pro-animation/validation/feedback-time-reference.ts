// CPU Float64 oracle only; never a production image fallback.
import {fromHalf,toHalf} from '../../../src/media/surface.ts';
import type {FeedbackMode} from '../src/native-feedback-time/index.ts';
export function feedbackReference(frame:number,mode:FeedbackMode,half:boolean){
 let old=new Float64Array(64*48*4);const quant=(v:number)=>half?fromHalf(toHalf(v)):Math.fround(v);
 for(let n=0;n<=frame;n++){
  const next=new Float64Array(old.length),gain=1+.02*n,color=[-.25+.01*n,2+.03*n,4-.02*n,.4].map(quant);
  for(let y=0;y<48;y++)for(let x=0;x<64;x++){
   const at=4*(y*64+x),dx=x+.5-(8+3*n),dy=y+.5-24,hit=dx*dx+dy*dy<4.25**2,a=color.map((v,c)=>hit?v*(c<3?gain:1):0),b=[0,1,2,3].map(c=>x===0?0:old[at-4+c]*.8);let out=a;
   if(n>0){if(mode==='add')out=a.map((v,c)=>v+b[c]);else if(mode==='over')out=a.map((v,c)=>v+b[c]*(1-a[3]));else if(mode==='behind')out=b.map((v,c)=>v+a[c]*(1-b[3]));else if(mode==='mix')out=a.map((v,c)=>v*.2+b[c]);else if(mode==='screen')out=a.map((v,c)=>v+b[c]-v*b[c]);else if(mode==='maximum')out=a.map((v,c)=>Math.max(v,b[c]));else if(mode==='minimum')out=a.map((v,c)=>Math.min(v,b[c]));else if(mode==='multiply')out=a.map((v,c)=>v*b[c]);else{out=a.map((v,c)=>mode==='difference'?Math.abs(v-b[c]):v-b[c]);out[3]=a[3]+b[3]*(1-a[3]);}}
   out[3]=Math.max(0,Math.min(1,out[3]));next.set(out,at);
  }old=next;
 }
 return Float32Array.from(old,v=>half?fromHalf(toHalf(v)):v);
}
