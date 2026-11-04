import {tensorBytes} from '../inference/schema.ts';
import {EngineError} from '../../src/core/errors.ts';
import type {NativeProgram} from './client.ts';

/** Compatibility default, not an engine maximum. Callers may choose a larger capacity. */
export const DEFAULT_NATIVE_FRAMES=128;
/** @deprecated Compatibility alias for the default, never an engine maximum. */
export const MAX_NATIVE_FRAMES=DEFAULT_NATIVE_FRAMES;
const imageBytes=(i:NativeProgram['images'][number])=>i.width*i.height*(i.storage==='packed-f16-v1'?8:16);
/** Linear scan over the EXISTING admitted pass order. This is allocation, not scheduling. */
export function residentLayout(program:Pick<NativeProgram,'images'|'passes'|'display'|'data'|'bufferOutputs'|'imports'|'frameContinuation'>){
 if(program.frameContinuation)return {mapping:program.images.map((_,i)=>i),bytes:program.images.reduce((n,i)=>n+i.width*i.height*16,0),logicalBytes:program.images.reduce((n,i)=>n+i.width*i.height*16,0)};
 // Match the existing Rust admission intervals: imports exist before pass0.
 const born=program.images.map(()=>Infinity),last=program.images.map(()=>0);
 for(const item of program.imports??[])born[item.image]=0;
 program.passes.forEach((p,n)=>{if(p.buffers)return;born[p.output]=n;last[p.output]=n;p.inputs.forEach(i=>{last[i]=n;});});
 program.passes.forEach((p,n)=>{for(const d of [...p.buffers??[],...p.data??[],...p.draw?[p.draw.positions,...p.draw.indices===undefined?[]:[p.draw.indices],...p.draw.uvs===undefined?[]:[p.draw.uvs]]:[]]){const i=program.data?.[d].sourceImage;if(i!==undefined)last[i]=Math.max(last[i],n);}});
 for(const out of program.bufferOutputs??[]){const i=program.data?.[out.buffer].sourceImage;if(i!==undefined)last[i]=program.passes.length;}
 if(program.display)last[program.display.image]=program.passes.length;
 // A headless final output is also retained for explicit export / inspection.
 const final=[...program.passes].reverse().find(p=>!p.buffers)?.output;if(final!==undefined)last[final]=program.passes.length;
 const allocations:{bytes:number;until:number}[]=[],mapping:number[]=[];
 const mixed=program.images.some(i=>i.storage==='packed-f16-v1');
 for(let i=0;i<program.images.length;i++){
  const bytes=imageBytes(program.images[i]);
  let chosen=-1,growth=bytes;
  for(let j=0;j<allocations.length;j++){
   const allocation=allocations[j];
   if(allocation.until>=born[i]||!mixed&&allocation.bytes<bytes)continue;
   const extra=Math.max(0,bytes-allocation.bytes);
   if(extra<growth||extra===growth&&chosen>=0&&allocation.bytes<allocations[chosen].bytes){chosen=j;growth=extra;}
  }
  if(chosen<0){chosen=allocations.length;allocations.push({bytes,until:last[i]});}
  else {const allocation=allocations[chosen];allocation.bytes+=growth;allocation.until=Math.max(allocation.until,last[i]);}
  mapping.push(chosen);
 }
 return {mapping,bytes:allocations.reduce((n,a)=>n+a.bytes,0),logicalBytes:program.images.reduce((n,a)=>n+a.width*a.height*16,0)};
}
export function nativeFrameCapacity(program:NativeProgram,budget:number,limit=DEFAULT_NATIVE_FRAMES){
 if(!Number.isSafeInteger(budget)||budget<1||!Number.isSafeInteger(limit)||limit<1)throw new EngineError('E_NATIVE_BUDGET','Expected a positive safe byte budget and frame capacity');
 const layout=residentLayout(program),uniforms=program.passes.reduce((n,p)=>{const k=program.kernels[p.kernel];return n+4*(k.headerWords+4*Math.max(1,Math.ceil(k.parameterWords/4)));},0);
 const display=program.display?program.images[program.display.image].width*program.images[program.display.image].height*16+16:0;
 const data=program.data?.reduce((n,d)=>n+(d.immutable||d.sourceImage!==undefined?0:d.length*4),0)??0,seeds=program.data?.reduce((n,d)=>n+(d.immutable?d.length:d.initial.length)*4,0)??0;
 const mesh=program.passes.reduce((n,p)=>{const i=program.images[p.output],d=p.draw,peel=program.kernels[p.kernel].meshMode==='depth-peel';return n+(d?i.width*i.height*(peel?52:20)+(peel?136+(d.indices===undefined?d.count*4:0):0):0);},0);
 const encoded=program.export?program.images[program.export.image].width*program.images[program.export.image].height*(program.export.format==='nv12'?1.5:program.export.format==='rgba'?4:16):0;
 const external=(program.modules?.reduce((n,m)=>n+m.width*m.height*4*(1+Number(m.input)),0)??0)+(program.imports??[]).reduce((n,i)=>n+(i.source==='hardware-video'?program.images[i.image].width*program.images[i.image].height*16:0),0);
 const media=program.mediaExport?program.images[program.mediaExport.image].width*program.images[program.mediaExport.image].height*35+8*1024**2:0;
 const inferenceModels=[...new Set([...program.passes.flatMap(p=>p.inference===undefined?[]:[p.inference]),...(program.inferences??[]).flatMap((m,i)=>m.file?[i]:[])])].map(i=>{const model=program.inferences?.[i];if(!model)throw new EngineError('E_INFERENCE_IDENTITY','Unknown model in native memory admission');return model;});const inference=inferenceModels.reduce((n,m)=>n+[...m.inputs,...m.outputs].reduce((b,t)=>b+Math.ceil(tensorBytes(t)/65536)*65536,0),0);
 const ray=program.passes.reduce((sum,p)=>sum+(p.rayBuild?4+p.rayBuild.geometries.reduce((v,g)=>v+g.count*12+96,0):0),0);
 const rayUniform=program.passes.filter(p=>p.rayQuery!==undefined).length*16;
 const perFrame=rayUniform+ray+layout.bytes+uniforms+display+data+mesh+Math.ceil(encoded/4)*8+external+media+inference,fixed=inferenceModels.reduce((n,m)=>n+m.model.bytes,0)+(program.display?4*(program.display.reach.length+program.display.cusp.length):0)+seeds+(program.imports??[]).reduce((n,i)=>n+(i.source==='hardware-video'&&i.video?Math.ceil(i.video.width/128)*128*Math.ceil(i.video.height/128)*128*(i.video.tenBit?3:2):0),0)+(program.mediaExport?.textures.reduce((n,t)=>n+t.width*t.height*(t.channels===1?4:16),0)??0);
 const boundary=(0)+(program.dataExport?(program.bufferOutputs??[]).reduce((n,o)=>Math.max(n,program.data![o.buffer].length*4),0):0);
 const capacity=Math.min(limit,program.frameContinuation||program.data?.some(d=>d.persistent)?1:limit,Math.floor((budget-fixed-boundary)/perFrame));
 if(![perFrame,fixed,boundary,capacity].every(Number.isSafeInteger)||capacity<1)throw new EngineError('E_NATIVE_BUDGET','One native frame exceeds the memory budget',{details:{budget,perFrame,fixed}});
 return {capacity,perFrame,fixed,layout};
}
