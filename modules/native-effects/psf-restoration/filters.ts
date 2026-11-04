import type {NativeStageInit,NativeGpuScope} from '../../native-gpu/authoring.ts';
import type {GpuDataBuffer,GpuComputeKernelSource} from '../../gpu-effects/compute-types.ts';
import type {GpuPixelImage} from '../../gpu-effects/pixel-types.ts';
import type {FrameContext} from '../../../src/core/types.ts';
import {createNativeRecipeProcessor} from '../images.ts';
import {closureRuntime} from '../closure-filters/runtime.ts';
import {parameters} from '../closure-filters/control.ts';
import {gridWeights,orderedObservations,boundary,integer,split,fail} from './control.ts';
import type * as T from './types.ts';
import * as C from './compute.ts';
import {publish} from './kernels.ts';

export function createPsfFilters(g:NativeGpuScope,context?:FrameContext,signal?:AbortSignal,inspection:T.PsfInspection={}):T.PsfFilters{
 const runtime=closureRuntime(g,context,signal),known=new WeakSet<T.SpatialPsf>(),limit=Math.floor(Math.min(g.capabilities().limits.maxBufferSize,g.capabilities().limits.maxStorageBufferBindingSize)/4);
 const fields=(name:string,o:T.ConvolveOptions|T.RestoreOptions,extra:readonly string[])=>{const p=parameters(name,context,signal);p.fields(o,extra);return p;};
 function checked(psf:T.SpatialPsf,image:GpuPixelImage){if(!known.has(psf)||psf.width!==image.info.width||psf.height!==image.info.height)fail('psf','an immutable calibration prepared in this recipe for the same image dimensions');}
 function words(image:GpuPixelImage,psf:T.SpatialPsf|undefined,b=0,extra=0,values:readonly number[]=[]){const p=new Uint32Array(128);p.set([image.info.width,image.info.height,psf?.kernelWidth??1,psf?.kernelHeight??1,psf?.columns??1,psf?.rows??1,b,psf?Number(psf.anchor==='input'):extra]);new Float32Array(p.buffer).set(values.flatMap(split),8);return p;}
 async function dispatch(k:GpuComputeKernelSource,b:readonly GpuDataBuffer[],image:GpuPixelImage,p:Uint32Array,o:Pick<T.ConvolveOptions,'signal'>){parameters(k.id,context,signal).active(o.signal);await g.dispatch(await g.compileCompute(k),b,{parameters:p,workItems:[image.info.width,image.info.height,1],signal:o.signal??signal});}
 async function output(image:GpuPixelImage,data:GpuDataBuffer,o:T.ConvolveOptions|T.RestoreOptions,preserve:boolean){const p=parameters('psfOutput',context,signal),amount=p.scalar(o.amount,1,'amount',0,1);return g.run(await g.compile(publish),[image],{output:{...image.info,format:o.format??image.info.format,alpha:'premultiplied'},parameters:words(image,undefined,0,Number(preserve),[amount]),data:[data],signal:o.signal??signal});}
 async function solve(reference:GpuPixelImage,observations:readonly T.JointObservation[],o:T.RestoreOptions):Promise<T.RestorationResult>{
  const p=fields('jointDeblur',o,['boundary','iterations','step','regularization','smoothness','alpha']),samples=orderedObservations(observations),iterations=integer(o.iterations??12,'jointDeblur','iterations',1,0x7fffffff),step=p.scalar(o.step,1,'step',2**-30,2-2**-23),ridge=p.scalar(o.regularization,1e-4,'regularization',0),smoothness=p.scalar(o.smoothness,0,'smoothness',0),b=boundary(o.boundary),alpha=o.alpha??'preserve-reference';
  if(!['preserve-reference','restore'].includes(alpha))fail('alpha','preserve-reference | restore');
  const image=await runtime.working(reference,o),n=image.info.width*image.info.height*4,owned:GpuDataBuffer[]=[],buffer=async(data?:Float32Array)=>{const value=await runtime.buffer(n,data);owned.push(value);return value;},view=async(i:GpuPixelImage)=>{const v=await runtime.view(i,o);owned.push(v);return v;},source=await view(image),prior=await buffer(),first=await buffer(),second=await buffer(),rhs=await buffer(),diagonal=await buffer(),normal=await buffer(),a=await buffer(),bb=await buffer(),cc=await buffer();
  try{
   const selected:{source:GpuDataBuffer;psf:T.SpatialPsf;mask:GpuDataBuffer;hasMask:boolean;weight:number;id:string}[]=[];let sumWeights=0;
   const dummy=await runtime.buffer(1,Float32Array.of(0));owned.push(dummy);
   for(const s of samples){if(s.observed===false)continue;checked(s.psf,image);const weight=p.scalar(s.weight,1,'observations.'+s.id+'.weight',0);if(!weight)continue;if(s.image?.info?.width!==image.info.width||s.image.info.height!==image.info.height)fail('observations.'+s.id+'.image','matching registered dimensions');if(s.mask&&(s.mask.info?.width!==image.info.width||s.mask.info.height!==image.info.height))fail('observations.'+s.id+'.mask','matching alpha-confidence dimensions');const working=await runtime.working(s.image,{...o,workingColor:image.info.color}),v=await view(working),packed=await buffer();await dispatch(C.pack,[v,packed],image,words(image,undefined,runtime.alpha(working)),o);selected.push({source:packed,psf:s.psf,mask:s.mask?await view(s.mask):dummy,hasMask:Boolean(s.mask),weight,id:s.id});sumWeights+=weight;}
   if(!selected.length||!Number.isFinite(sumWeights))fail('observations.weight','one or more positive finite weights with finite total');
   const zero=async(target:GpuDataBuffer)=>dispatch(C.clear,[target],image,words(image,undefined),o),weighted=async(input:GpuDataBuffer,target:GpuDataBuffer,s:typeof selected[number])=>dispatch(C.weightInput,[input,s.mask,target],image,words(image,undefined,0,Number(s.hasMask)),o),accumulate=async(input:GpuDataBuffer,target:GpuDataBuffer,s:typeof selected[number])=>dispatch(C.accumulate,[input,target],image,words(image,undefined,0,0,[s.weight/sumWeights]),o),operator=async(transpose:boolean,input:GpuDataBuffer,target:GpuDataBuffer,s:typeof selected[number])=>dispatch(transpose?C.transpose:C.forward,[input,s.psf.weights,target],image,words(image,s.psf,b),o);
   await dispatch(C.pack,[source,prior],image,words(image,undefined,runtime.alpha(image)),o);await dispatch(C.copy,[prior,first],image,words(image,undefined),o);await zero(rhs);await zero(diagonal);
   for(const s of selected){await weighted(s.source,a,s);await operator(true,a,bb,s);await accumulate(bb,rhs,s);await dispatch(C.pack,[source,a],image,words(image,undefined,0,1),o);await operator(false,a,bb,s);await weighted(bb,a,s);await operator(true,a,bb,s);await accumulate(bb,diagonal,s);}
   await inspection.inspect?.('rhs',rhs);await inspection.inspect?.('normal-diagonal',diagonal);await inspection.inspect?.('iterate-0',first);
   let current=first,next=second;
   for(let iteration=0;iteration<iterations;iteration++){p.active(o.signal);await zero(normal);for(const s of selected){await operator(false,current,a,s);await weighted(a,bb,s);await operator(true,bb,cc,s);await accumulate(cc,normal,s);}await dispatch(C.update,[current,prior,rhs,normal,diagonal,next],image,words(image,undefined,0,Number(alpha==='restore'),[step,ridge,smoothness]),o);[current,next]=[next,current];await inspection.inspect?.('iterate-'+(iteration+1),current);}
   const result=await output(image,current,o,alpha==='preserve-reference'),resultDiagonal=diagonal;owned.splice(owned.indexOf(diagonal),1);
   return Object.freeze({kind:'native-joint-restoration',version:1,image:result,iterations,observations:selected.length,missingObservations:samples.filter(s=>s.observed===false).length,normalDiagonal:resultDiagonal});
  }finally{for(const v of owned.reverse())await g.releaseBuffer(v);}
 }
 const f:T.PsfFilters={
  async prepareSpatialPsf(image,grid){if(!image?.info)fail('image','an admitted image domain');const values=gridWeights(grid,limit),weights=await g.createBuffer({type:'f32',length:values.length},values),result:T.SpatialPsf=Object.freeze({kind:'native-spatial-psf',version:1,anchor:grid.anchor??'output',width:image.info.width,height:image.info.height,columns:grid.columns,rows:grid.rows,kernelWidth:grid.kernelWidth,kernelHeight:grid.kernelHeight,weights});known.add(result);return result;},
  async convolveSpatialPsf(source,psf,o={}){const p=fields('convolveSpatialPsf',o,['boundary','alpha']),b=boundary(o.boundary);if(o.alpha!==undefined&&!['filter','preserve-reference'].includes(o.alpha))fail('alpha','filter | preserve-reference');p.active(o.signal);checked(psf,source);const image=await runtime.working(source,o),view=await runtime.view(image,o),input=await runtime.buffer(image.info.width*image.info.height*4),blurred=await runtime.buffer(input.info.length);try{await dispatch(C.pack,[view,input],image,words(image,undefined,runtime.alpha(image)),o);await dispatch(C.forward,[input,psf.weights,blurred],image,words(image,psf,b),o);await inspection.inspect?.('convolved',blurred);return await output(image,blurred,o,o.alpha==='preserve-reference');}finally{for(const v of [view,input,blurred])await g.releaseBuffer(v);}},
  spatialDeblur(image,psf,o={}){return solve(image,[{id:'source',time:{num:0,den:1},alignment:'registered-reference',image,psf}],o);},
  jointDeblur:solve,
 };
 return f;
}
export function createNativePsfRestorationEffects(init:Pick<NativeStageInit,'gpu'>,inspection:T.PsfInspection={}){
 if(!inspection||Object.keys(inspection).some(k=>k!=='inspect')||inspection.inspect!==undefined&&typeof inspection.inspect!=='function')fail('inspection','optional explicit GPU publication callback');
 return createNativeRecipeProcessor<T.PsfFilters>(init,(g,c,_track,s)=>createPsfFilters(g,c,s,inspection));
}
