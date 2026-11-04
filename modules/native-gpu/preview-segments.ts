import type {Keyframe,TimeMapping,TVG} from '../../src/core/types.ts';
import {isActive} from '../../src/core/time.ts';
import {hashValue} from '../../src/render/cache.ts';

export interface PreviewRegion {start:number;end:number;signature:string}

const localFrame=(frame:number,time:TimeMapping)=>time.offset+(frame-time.start)*time.rate.num/time.rate.den;

function visitTracks(value:unknown,visit:(keys:readonly Keyframe[])=>void){
 if(!value||typeof value!=='object')return;
 if('$keyframes' in value){visit(value.$keyframes as Keyframe[]);return;}
 if('$expr' in value||'$spring' in value)return;
 for(const child of Object.values(value))visitTracks(child,visit);
}

// Match evaluate() and keyframesAt(). Keep only keys that can affect the region.
function regionSignals(value:unknown,frame:number):unknown{
 if(!value||typeof value!=='object')return value;
 if('$keyframes' in value){
  const keys=value.$keyframes as Keyframe[];
  let first=0,last=keys.length-1;
  if(frame<=keys[first].frame)return {$keyframes:[{frame:0,value:keys[first].value}]};
  if(frame>=keys[last].frame)return {$keyframes:[{frame:0,value:keys[last].value}]};
  while(last-first>1){
   const mid=Math.floor((first+last)/2);
   if(keys[mid].frame<=frame)first=mid;else last=mid;
  }
  return {$keyframes:[{frame:keys[first].frame,value:keys[first].value},keys[last]]};
 }
 if('$expr' in value||'$spring' in value)return value;
 if(Array.isArray(value))return value.map(item=>regionSignals(item,frame));
 return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,regionSignals(item,frame)]));
}

/** Resource-free declarative previews have no undeclared time dependencies.
 * Split along active ranges and keyframe interpolation intervals. */
export class PreviewSegments {
 private readonly boundaries:number[];
 private readonly signatures=new Map<number,string>();
 constructor(private readonly tvg:TVG){
  const end=tvg.composition.durationInFrames;
  const points=new Set<number>([0,end]);
  const mark=(frame:number)=>{const step=Math.ceil(frame);if(step>0&&step<end)points.add(step);};
  for(const stage of tvg.stages){
   const {time}=stage;
   mark(time.start);mark(time.start+time.duration);
   visitTracks(stage.props,keys=>{
    // Search the real integer timeline using the same arithmetic as frameContext.
    // The first key still clamps at equality, unlike interior and final keys.
    for(let i=0;i<keys.length&&keys.length>1;i++){
     const key=keys[i].frame;
     let lo=Math.max(0,Math.ceil(time.start)),hi=Math.min(end,Math.ceil(time.start+time.duration));
     while(lo<hi){
      const mid=Math.floor((lo+hi)/2),at=localFrame(mid,time);
      if(at<key||(i===0&&at===key))lo=mid+1;else hi=mid;
     }
     mark(lo);
    }
   });
  }
  for(const layer of tvg.layers){
   mark(layer.start);mark(layer.end);
   visitTracks(layer,keys=>{
    if(keys.length>1)keys.forEach(({frame},i)=>mark(i===0?Math.floor(frame)+1:frame));
   });
  }
  this.boundaries=[...points].sort((a,b)=>a-b);
 }
 private index(frame:number){
  let lo=0,hi=this.boundaries.length-1;
  while(hi-lo>1){const mid=Math.floor((lo+hi)/2);if(this.boundaries[mid]<=frame)lo=mid;else hi=mid;}
  return lo;
 }
 signature(frame:number){
  const lo=this.index(frame);
  let signature=this.signatures.get(lo);
  if(signature===undefined){
   const start=this.boundaries[lo],layers=this.tvg.layers.filter(l=>l.start<=start&&start<l.end);
   const referenced=new Set(layers.flatMap(l=>[l.source?.$ref,l.mask?.$ref]).filter(id=>id!==undefined));
   const stages=this.tvg.stages.filter(s=>isActive(s,start))
    .map(s=>({...s,props:regionSignals(s.props,localFrame(start,s.time))}));
   const ports=this.tvg.stages.filter(s=>referenced.has(s.id)).map(s=>[s.id,s.outputs]);
   signature=hashValue(['native-preview-region-v2',this.tvg.composition,stages,regionSignals(layers,start),ports]);
   this.signatures.set(lo,signature);
  }
  return signature;
 }
 retainFrom(previous:PreviewSegments):PreviewRegion[]{
  const retained:PreviewRegion[]=[];
  const end=this.tvg.composition.durationInFrames;
  const requested=[...previous.signatures.entries()].sort(([a],[b])=>a-b);
  for(const [index,signature] of requested){
   const first=previous.boundaries[index],last=Math.min(end,previous.boundaries[index+1]);
   for(let current=this.index(first),start=first;start<last;current++){
    const stop=Math.min(last,this.boundaries[current+1]);
    if(this.signature(start)===signature){
     const prior=retained.at(-1);
     if(prior?.end===start&&prior.signature===signature)prior.end=stop;
     else retained.push({start,end:stop,signature});
    }
    start=stop;
   }
  }
  return retained;
 }
}
