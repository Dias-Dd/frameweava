// SPDX-License-Identifier: Apache-2.0
// TEST-ONLY scalar-pixel oracle. Not an effect, Surface processor, or CPU fallback.
export type ReferencePixel=readonly [number,number,number,number];
export interface WeightedReferencePixel {pixel:ReferencePixel;weight:number;alpha:'straight'|'premultiplied'|'opaque'}
function sum(values:readonly number[]):number {
 let total=0,correction=0;
 for(const value of values){const next=total+value;correction+=Math.abs(total)>=Math.abs(value)?total-next+value:value-next+total;total=next;}
 return total+correction;
}
/** Binary64 reference over already-common scene-linear color/size. No color conversion here. */
export function referenceTemporalMean(samples:readonly WeightedReferencePixel[]):ReferencePixel {
 if(samples.length===0)throw new Error('Reference needs at least one sample');
 let maximum=0;
 for(const {pixel,weight,alpha}of samples){
  if(pixel.length!==4||pixel.some(v=>!Number.isFinite(v)||!Number.isFinite(Math.fround(v)))||pixel[3]<0||pixel[3]>1)throw new Error('Invalid reference pixel');
  if(!['straight','premultiplied','opaque'].includes(alpha)||alpha==='opaque'&&pixel[3]!==1)throw new Error('Invalid reference alpha');
  if(!Number.isFinite(weight)||weight<0)throw new Error('Reference weights must be finite and nonnegative');
  maximum=Math.max(maximum,weight);
 }
 if(maximum===0)throw new Error('Reference needs a positive weight');
 // A shared power of two avoids overflow without introducing 1/3-style rounding
 // for exactly representable integer/dyadic weights. log2(MAX_VALUE) rounds to 1024.
 const scale=2**Math.min(1023,Math.floor(Math.log2(maximum))),scaled=samples.map(s=>s.weight/scale);
 if(samples.some((s,i)=>s.weight>0&&scaled[i]===0))throw new Error('Reference weight ratio is below Float64 resolution');
 const denominator=sum(scaled);
 return [0,1,2,3].map(channel=>sum(samples.map((sample,i)=>{
  const a=sample.pixel[3],value=channel===3?a:sample.pixel[channel]*(sample.alpha==='premultiplied'?1:a);
  return value*scaled[i];
 }))/denominator) as unknown as ReferencePixel;
}
