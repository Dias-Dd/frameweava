import type {FrameContext,Signal} from '../../../src/core/types.ts';
import {createGpuPixelEffects} from '../../gpu-effects/index.ts';
import type {GpuPixelImage,GpuPixelScope,GpuPixelKernelSourceV1} from '../../gpu-effects/pixel-types.ts';
import {fields,number,flag,fail,type OutputOptions} from './parameters.ts';
import {extractMask,morphStep,mixMask,levelsMask,multiplyMask} from './matte-kernels.ts';
export interface MorphologyOptions extends OutputOptions {operation?:'erode'|'dilate'|'open'|'close';radius?:Signal<number>;axis?:'both'|'horizontal'|'vertical';boundary?:'transparent'|'clamp'}
export interface FeatherMatteOptions extends OutputOptions {radius?:Signal<number>;boundary?:'transparent'|'clamp'}
export interface MatteLevelsOptions extends OutputOptions {black?:Signal<number>;white?:Signal<number>;gamma?:Signal<number>;invert?:boolean}
export interface ProfessionalMatteFilters {
 extractMatte(input:GpuPixelImage,options?:OutputOptions):Promise<GpuPixelImage>;
 morphology(input:GpuPixelImage,options?:MorphologyOptions):Promise<GpuPixelImage>;
 featherMatte(input:GpuPixelImage,options?:FeatherMatteOptions):Promise<GpuPixelImage>;
 matteLevels(input:GpuPixelImage,options?:MatteLevelsOptions):Promise<GpuPixelImage>;
 applyMatte(input:GpuPixelImage,mask:GpuPixelImage,options?:OutputOptions):Promise<GpuPixelImage>;
}
/** Radii compose as Minkowski sums of contiguous integer intervals. Each step
 * samples {-step,0,+step}; step<=2*covered+1 keeps the expanded window gap-free.
 * O(log radius) passes; no arbitrary fixed neighborhood/workload ceiling. */
export function morphologySteps(radius:number){if(!Number.isSafeInteger(radius)||radius<0)fail('Integer nonnegative morphology extent required');const steps:number[]=[];for(let covered=0;covered<radius;){const step=Math.min(2*covered+1,radius-covered);steps.push(step);covered+=step;}return steps;}
export function createMatteFilters(scope:GpuPixelScope,context?:FrameContext,track:(image:GpuPixelImage)=>GpuPixelImage=v=>v,signal?:AbortSignal):ProfessionalMatteFilters{
 const blur=createGpuPixelEffects(scope);
 async function pass(k:GpuPixelKernelSourceV1,images:readonly GpuPixelImage[],parameters:Uint32Array|Float32Array,o:OutputOptions={},format=o.format??images[0].info.format){
  const cancel=o.signal??signal;if(scope.stats().pendingPasses>=scope.capabilities().maxPendingPasses)await scope.complete({signal:cancel});
  return scope.run(await scope.compile(k),images,{parameters,output:{format,alpha:'premultiplied'},signal:cancel});
 }
 async function integer(input:GpuPixelImage,radius:number,max:boolean,axis:'both'|'horizontal'|'vertical',clamp:boolean,owned:GpuPixelImage[],o:OutputOptions){
  let current=input;for(const direction of axis==='horizontal'?[0]:axis==='vertical'?[1]:[0,1]){
   const dimension=direction===0?input.info.width:input.info.height;
   // For nonnegative Alpha, dilation saturates at the largest in-frame extent;
   // transparent erosion needs one additional empty pixel to become all-zero.
   const effective=Math.min(radius,clamp||max?dimension-1:dimension);
   for(const step of morphologySteps(effective)){const previous=current;current=await pass(morphStep,[previous],Uint32Array.of(step,direction,Number(max),Number(clamp)),o,'rgba32float');owned.push(current);if(previous!==input)await scope.release(previous);}
  }return current;
 }
 async function fractional(input:GpuPixelImage,radius:number,max:boolean,axis:'both'|'horizontal'|'vertical',clamp:boolean,owned:GpuPixelImage[],o:OutputOptions){
  const whole=Math.floor(radius),t=Math.fround(radius-whole),a=await integer(input,whole,max,axis,clamp,owned,o);if(t===0)return a;
  const b=await integer(input,whole+1,max,axis,clamp,owned,o),mixed=await pass(mixMask,[a,b],Float32Array.of(t),o,'rgba32float');owned.push(mixed);return mixed;
 }
 return {
  async extractMatte(input,o={}){fields(o,[],'extractMatte');return track(await pass(extractMask,[input],new Uint32Array(0),o));},
  async morphology(input,o={}){
   fields(o,['operation','radius','axis','boundary'],'morphology');const operation=o.operation??'erode',axis=o.axis??'both',boundary=o.boundary??'transparent';if(!['erode','dilate','open','close'].includes(operation)||!['both','horizontal','vertical'].includes(axis)||!['transparent','clamp'].includes(boundary))fail('Unknown morphology operation, axis or boundary');
   const radius=number(o.radius,1,'radius',context,0);if(!Number.isSafeInteger(Math.ceil(radius)))fail('Morphology radius must have a safe integer extent');
   const owned:GpuPixelImage[]=[];try{let current=await pass(extractMask,[input],new Uint32Array(0),o,'rgba32float');owned.push(current);const firstMax=operation==='dilate'||operation==='close';current=await fractional(current,radius,firstMax,axis,boundary==='clamp',owned,o);if(operation==='open'||operation==='close')current=await fractional(current,radius,!firstMax,axis,boundary==='clamp',owned,o);
    return track(await pass(extractMask,[current],new Uint32Array(0),o,o.format??input.info.format));
   }finally{for(const image of owned.reverse())await scope.release(image);}
  },
  async featherMatte(input,o={}){
   fields(o,['radius','boundary'],'featherMatte');const radius=number(o.radius,2,'radius',context,0,64);if(o.boundary!==undefined&&!['transparent','clamp'].includes(o.boundary))fail('Unknown feather boundary');if(scope.stats().pendingPasses+4>scope.capabilities().maxPendingPasses)await scope.complete({signal:o.signal??signal});const source=await pass(extractMask,[input],new Uint32Array(0),o,'rgba32float');
   try{return track(await blur.blur(source,{radius,boundary:o.boundary??'transparent',format:o.format??input.info.format,signal:o.signal??signal}));}finally{await scope.release(source);}
  },
  async matteLevels(input,o={}){
   fields(o,['black','white','gamma','invert'],'matteLevels');const black=number(o.black,0,'black',context,0,1),white=number(o.white,1,'white',context,0,1),gamma=number(o.gamma,1,'gamma',context,0);if(white<=black||gamma<=0)fail('Matte levels require white>black and gamma>0');const p=Float32Array.of(black,white,gamma,0);new Uint32Array(p.buffer)[3]=Number(flag(o.invert,false,'invert'));return track(await pass(levelsMask,[input],p,o));
  },
  async applyMatte(input,mask,o={}){
   fields(o,[],'applyMatte');if(input.info.width!==mask.info.width||input.info.height!==mask.info.height)fail('Image and matte require matching dimensions');return track(await pass(multiplyMask,[input,mask],new Uint32Array(0),o));
  },
 };
}
