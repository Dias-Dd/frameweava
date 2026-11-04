import type {NativeStageInit,NativeGpuScope} from '../../native-gpu/authoring.ts';
import type {NativeInferenceScope,NativeInferenceModel} from '../../inference/native.ts';
import type {GpuDataBuffer} from '../../gpu-effects/compute-types.ts';
import type {GpuPixelImage} from '../../gpu-effects/pixel-types.ts';
import {EngineError} from '../../../src/core/errors.ts';
import {linear709} from '../../../src/media/surface.ts';
import {createNativeRecipeProcessor} from '../images.ts';
import {closureRuntime} from '../closure-filters/runtime.ts';
import {keyingRuntime} from '../keying/runtime.ts';
import {preprocess} from '../roto-authoring/neural-compute.ts';
import {applyMask} from '../roto-authoring/neural-kernels.ts';
import {split} from '../closure-filters/control.ts';
import {parseVideoRotoBundle,validateOptions,memoryPlan,fail} from './schema.ts';
import * as C from './compute.ts';
import type {VideoRotoBundle,VideoRotoFilters,VideoRotoInspection} from './types.ts';
export {parseVideoRotoBundle} from './schema.ts';
export type * from './types.ts';

function inference(g:NativeGpuScope):NativeGpuScope&NativeInferenceScope{for(const n of ['createInference','runInference','releaseInference'])if(typeof Reflect.get(g,n)!=='function')throw new EngineError('E_INFERENCE_UNAVAILABLE','Video Roto requires installed Native inference: '+n);return g as NativeGpuScope&NativeInferenceScope;}
/** Explicit samples, one existing Native owner. Memory is GPU-only and recipe
 * local; random queries deterministically replay from the authored anchor.
 * Uses optional exact output destinations and same-frame prefix continuation
 * when advertised. Cross-frame persistent replay checkpoints are not implied. */
export async function createNativeVideoRotoEffects(init:Pick<NativeStageInit,'gpu'>,source:VideoRotoBundle,inspection:VideoRotoInspection={}){
 const bundle=parseVideoRotoBundle(source),owner=inference(init.gpu),models:Partial<Record<'vision'|'seed'|'track',NativeInferenceModel>>={};
 if(!inspection||Object.keys(inspection).some(k=>k!=='inspect')||inspection.inspect!==undefined&&typeof inspection.inspect!=='function')fail('inspection','one optional explicit publication callback');
 let constants:GpuDataBuffer;
 try{for(const role of ['vision','seed','track'] as const)models[role]=await owner.createInference(bundle[role]);const values=Float32Array.from([...bundle.temporal,...bundle.pointerProjectionWeight,...bundle.pointerProjectionBias]);constants=await owner.createBuffer({type:'f32',length:values.length},values);}catch(e){for(const m of Object.values(models).reverse())await owner.releaseInference(m);throw e;}
 const vision=models.vision!,seed=models.seed!,track=models.track!;
 const processor=createNativeRecipeProcessor<VideoRotoFilters>(init,(g,context,_track,signal)=>{
  const c=closureRuntime(g,context,signal),r=keyingRuntime(g,context,signal),nn=inference(g);
  return {async trackVideoRoto(image,sourceAt,options){
   const o=validateOptions(options);if(typeof sourceAt!=='function')fail('sourceAt','an explicit deterministic frame reader');
   const {width:w,height:h}=image.info;
   if(!o.seedMask?.info||o.seedMask.info.width!==w||o.seedMask.info.height!==h)fail('seedMask','owner-local alpha coverage at source dimensions');
   const active=()=>{if((o.signal??signal)?.aborted)throw new EngineError('E_RENDER_CANCELLED','Video segmentation cancelled');};active();
   const capabilities=g.capabilities().nativeInference,reusable=capabilities?.preallocatedOutputs===true,continuation=capabilities?.imageContinuation==='same-frame-prefix-v1',segmentFrames=o.segmentFrames??(continuation?8:0);
   if(segmentFrames&&!continuation)throw new EngineError('E_VIDEO_ROTO_CONTINUATION','Requested inference segmentation requires matching same-frame-prefix-v1 Core support');
   const nnOutputs=new Set<GpuDataBuffer>(),owned:GpuDataBuffer[]=[];
   const buffer=async(n:number,data?:Float32Array)=>{const b=await c.buffer(n,data);owned.push(b);return b;};
   const capture=async(frame:number,name:Parameters<NonNullable<VideoRotoInspection['inspect']>>[0]['name'],b:GpuDataBuffer)=>inspection.inspect?.({id:o.id,frame,name,buffer:b});
   try{
    const input=await buffer(3*1048576),authored=await buffer(1048576),memory=await buffer(7*4096*64),pointers=await buffer(16*256),memoryPos=await buffer(7*4096*64),pointerPos=await buffer(16*256),valid=await buffer(28736);
    // Banks and optional output destinations remain transient in this authored
    // frame. Existing same-frame cuts retain these buffers without JS snapshots.
    const destinations=async(model:NativeInferenceModel)=>{const result:Record<string,GpuDataBuffer>={};for(const t of model.info.outputs)result[t.name]=await buffer(t.shape.reduce((n,v)=>n*v,1));return result;};
    const encodedDestinations=reusable?await destinations(vision):undefined,decodedDestinations=reusable?await destinations(track):undefined;
    await g.clearBuffer(memory);await g.clearBuffer(pointers);
    const maskView=await c.view(o.seedMask,o);owned.push(maskView);
    await c.dispatch(C.seedMask,[maskView,authored],r.params(image,[],[w,h]),[1024,1024,1],o);
    const memories:(number|undefined)[]=Array(7).fill(undefined),pointerFrames:(number|undefined)[]=Array(16).fill(undefined);
    let memoryCursor=1,pointerCursor=1,observedFrames=0,missingFrames=0,last:Record<string,GpuDataBuffer>|undefined;
    for(let frame=o.seedFrame;frame<=o.frame;frame++){
     active();const sample=frame===o.frame?image:await sourceAt(frame);
     if(!sample){if(frame===o.seedFrame)fail('sourceAt('+frame+')','an observed conditioning frame');missingFrames++;continue;}
     if(sample.info.width!==w||sample.info.height!==h)fail('sourceAt('+frame+').dimensions','stable source dimensions');
     const working=await c.working(sample,{workingColor:{...linear709,referenceWhiteNits:sample.info.color.referenceWhiteNits},signal:o.signal}),view=await c.view(working,o);owned.push(view);
     await c.dispatch(preprocess,[view,input],r.params(working,[...(o.analysisBackground??[0,0,0]),.485,.456,.406,.229,.224,.225],[w,h,c.alpha(working),1024,1024]),[1024,1024,1],o);await capture(frame,'pixels',input);
     const encoded=await nn.runInference(vision,{pixels:input},{...encodedDestinations?{outputs:encodedDestinations}:{},signal:o.signal??signal});if(!reusable)Object.values(encoded).forEach(b=>nnOutputs.add(b));
     for(const name of ['high0','high1','features'] as const)await capture(frame,name,encoded[name]);
     let output:Record<string,GpuDataBuffer>;
     if(frame===o.seedFrame)output=await nn.runInference(seed,{features:encoded.features,authored},{...decodedDestinations?{outputs:decodedDestinations}:{},signal:o.signal??signal});
     else{
      const words=memoryPlan(frame,o.seedFrame,memories,pointerFrames,o.totalFrames);
      await g.dispatch(await g.compileCompute(C.prepareMemory),[constants,memoryPos,pointerPos,valid],{parameters:words,workItems:[64,448,1],signal:o.signal??signal});
      for(const [name,b] of [['memory_pos',memoryPos],['pointer_pos',pointerPos],['valid',valid],['spatial_memory',memory],['object_pointers',pointers]] as const)await capture(frame,name,b);
      output=await nn.runInference(track,{...encoded,spatial_memory:memory,spatial_memory_pos:memoryPos,object_pointers:pointers,object_pointer_pos:pointerPos,valid},{...decodedDestinations?{outputs:decodedDestinations}:{},signal:o.signal??signal});
     }
     if(!reusable)Object.values(output).forEach(b=>nnOutputs.add(b));
     for(const name of ['logits','memory','pointer','object_score'] as const)await capture(frame,name,output[name]);
     const slot=frame===o.seedFrame?0:memoryCursor,ptr=frame===o.seedFrame?0:pointerCursor;
     await g.copyBuffer(output.memory,memory,{targetOffset:slot*4096*64,length:4096*64});await g.copyBuffer(output.pointer,pointers,{targetOffset:ptr*256,length:256});
     memories[slot]=frame;pointerFrames[ptr]=frame;if(slot){memoryCursor=memoryCursor%6+1;pointerCursor=pointerCursor%15+1;}
     observedFrames++;last=output;
     if(!reusable)for(const b of Object.values(encoded)){await g.releaseBuffer(b);nnOutputs.delete(b);}
     if(!reusable&&frame!==o.frame)for(const b of Object.values(output)){await g.releaseBuffer(b);nnOutputs.delete(b);}
     await g.releaseBuffer(view);owned.splice(owned.indexOf(view),1);
     if(segmentFrames&&observedFrames%segmentFrames===0&&frame!==o.frame){active();await g.flushState({version:1,signal:o.signal??signal});active();}
    }
    if(!last)fail('observations','one or more actual observed frames');
    const mask=await g.createField({type:'f32',dimensions:[w,h,1],components:2,semantic:'generic',space:'image',units:'coverage-and-observation-validity',channels:['coverage','validity']});
    await c.dispatch(C.buildMask,[last.logits,mask],r.params(image,[o.threshold??0,o.softness??0],[w,h]),[w,h,1],o);await capture(o.frame,'mask',mask);
    const parameters=r.params(image,[],[0]);new Float32Array(parameters.buffer).set(split(1),68);
    const result=await g.run(await g.compile(applyMask),[image],{output:{...image.info,format:o.format??image.info.format,alpha:'premultiplied'},parameters,data:[mask],signal:o.signal??signal});
    const objectScore=await g.cloneBuffer(last.object_score),lastMemory=await g.cloneBuffer(last.memory);
    return Object.freeze({kind:'native-video-roto-result',version:1,id:o.id,frame:o.frame,image:result,mask,objectScore,memory:lastMemory,observedFrames,missingFrames});
   }finally{for(const b of [...nnOutputs].reverse())await g.releaseBuffer(b);for(const b of owned.reverse())await g.releaseBuffer(b);}
  }};
 });
 let closing:Promise<void>|undefined;
 return {...processor,dispose(){return closing??=(async()=>{try{await processor.dispose();}finally{try{await owner.releaseBuffer(constants);}finally{for(const m of [track,seed,vision])await owner.releaseInference(m);}}}) ();}};
}
