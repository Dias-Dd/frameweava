// TEST-ONLY Float64 oracle. No Surface processor or production CPU fallback.
import type {TemporalReduction} from '../src/native-time/types.ts';
export type Pixel=readonly [number,number,number,number];
export function temporalReference(samples:readonly {pixel:Pixel;weight:number;alpha?:'premultiplied'|'straight'|'opaque'}[],mode:TemporalReduction):number[]{
 const values=samples.map(s=>{const a=s.pixel[3];return s.pixel.map((v,c)=>v*(c<3&&s.alpha==='straight'?a:1)*s.weight);});
 const stable=(a:number[])=>{let hi=0,lo=0;for(const v of a){const next=hi+v;lo+=Math.abs(hi)>=Math.abs(v)?hi-next+v:v-next+hi;hi=next;}return hi+lo;};
 let out:number[];
 if(['add','blend','weighted-mean'].includes(mode)){
  const divisor=mode==='add'?1:mode==='blend'?samples.length:stable(samples.map(s=>s.weight));
  out=[0,1,2,3].map(c=>divisor===0?0:stable(values.map(v=>v[c]))/divisor);
 }else if(mode==='maximum'||mode==='minimum'){
  out=values.length?values.reduce((a,b)=>a.map((v,c)=>mode==='maximum'?Math.max(v,b[c]):Math.min(v,b[c]))):[0,0,0,0];
 }else if(mode==='screen'){
  out=[0,0,0,0];for(const value of values)out=out.map((v,c)=>v+value[c]-v*value[c]);
 }else{
  out=[0,0,0,0];for(const value of values)out=mode==='in-front'?out.map((v,c)=>v+value[c]*(1-out[3])):out.map((v,c)=>value[c]+v*(1-value[3]));
 }
 out[3]=Math.max(0,Math.min(1,out[3]));return out;
}
