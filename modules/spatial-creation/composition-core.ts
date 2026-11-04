import {linear709} from '../../src/media/surface.ts';
import {EngineError} from '../../src/core/errors.ts';
import {matrix} from '../../src/media/compositor-geometry.ts';
import type {Transform,FrameContext,Signal} from '../../src/core/types.ts';
import type {GpuPixelImage,GpuPixelKernel} from '../gpu-effects/pixel-types.ts';
import type {GpuDataBuffer} from '../gpu-effects/compute-types.ts';
import {binaryKernel,prepareKernel} from '../native-effects/raster/kernels.ts';
import {split} from '../native-effects/pa/filters.ts';
import type {CreationInit,CreationStage,CreationInputs} from './types.ts';
import {scalar,fail} from './lifecycle.ts';

export type ChildOwnership='owned'|'borrowed';
export type CreationSource=CreationStage|Promise<CreationStage>;
export async function children(source:readonly CreationSource[],ownership:ChildOwnership='owned'){
 if(!['owned','borrowed'].includes(ownership)||!Array.isArray(source))fail('Expected creators and explicit owned/borrowed child policy','E_CREATION_COMPOSE');
 const result=await Promise.allSettled([...source]),items:CreationStage[]=[],errors:unknown[]=[];
 for(const item of result){if(item.status==='rejected'){errors.push(item.reason);continue;}const value=item.value;if(!value||typeof value.renderAt!=='function'||typeof value.inspect!=='function'||value.dispose!==undefined&&typeof value.dispose!=='function')errors.push(new Error('Expected a CreationStage, not a GPU image or Stage/PortRef'));else items.push(value);}
 if(errors.length){const cleanup=ownership==='owned'?await Promise.allSettled([...new Set(items)].map(s=>Promise.resolve().then(()=>s.dispose?.()))):[],primary=errors[0] as {code?:string;message?:string}|null;throw new EngineError(primary?.code??'E_CREATION_COMPOSE','Creator construction failed: '+(primary?.message??String(primary)),{details:{constructionErrors:errors.map(String),cleanupErrors:cleanup.filter((r):r is PromiseRejectedResult=>r.status==='rejected').map(r=>String(r.reason))}});}
 return {items,async dispose(){if(ownership==='borrowed')return;const result=await Promise.allSettled([...new Set(items)].map(s=>Promise.resolve().then(()=>s.dispose?.()))),errors=result.filter((r):r is PromiseRejectedResult=>r.status==='rejected');if(errors.length)throw new AggregateError(errors.map(r=>r.reason),'Creator child cleanup failed');}};
}
export function imageCheck(image:GpuPixelImage,init:CreationInit,matchSize=true,allowStraight=false){
 const info=image?.info;if(!info||!['rgba16float','rgba32float'].includes(info.format)||!['premultiplied','opaque',...allowStraight?['straight']:[]].includes(info.alpha)||(Object.keys(linear709) as (keyof typeof linear709)[]).some(k=>info.color?.[k]!==linear709[k])||matchSize&&(info.width!==init.width||info.height!==init.height))fail('Creator image must match the declared dimensions and linear Rec709 float/Alpha contract','E_CREATION_COMPOSE_IMAGE');return image;
}
export async function childImage(child:CreationStage,index:number,init:CreationInit,c:FrameContext,inputs:CreationInputs,props:Record<string,unknown>){
 let image:GpuPixelImage;try{image=await child.renderAt(c,inputs,props);}catch(error){const e=error as {code?:string;message?:string;details?:unknown}|null;throw new EngineError(e?.code??'E_CREATION_CHILD','Creator '+index+' at local frame '+c.frame+': '+(e?.message??String(error)),{frame:c.frame,details:{childIndex:index,cause:e?.details}});}
 if(Object.values(inputs).includes(image))fail('Creator '+index+' returned a borrowed input as owned; use imageCreation for image inputs','E_CREATION_OWNERSHIP');
 // Caller adopts before validating so malformed OWNED results can be cleaned.
 return image;
}
const constants=new WeakMap<CreationInit['gpu'],Promise<GpuPixelKernel>>();
/** Allocation/constant-color primitive only; visual operators below are the
 * original engine kernels. No image upload/readback or new GPU owner. */
export async function constantImage(init:CreationInit,rgba:readonly number[],format:'rgba16float'|'rgba32float',signal?:AbortSignal){
 if(rgba.length!==4||rgba.some(v=>!Number.isFinite(v)||!Number.isFinite(Math.fround(v))||v!==0&&Math.fround(v)===0)||rgba[3]<0||rgba[3]>1)fail('Representable linear RGB and Alpha0..1 required');
 let kernel=constants.get(init.gpu);if(!kernel){kernel=init.gpu.compile({abiVersion:1,id:'frameweave/spatial-creation/constant-color',version:'0.1.0',inputCount:0,parameterWords:4,code:'fn pixel(p:vec2u)->vec4f{let a=paramF32(3u);return vec4f(vec3f(paramF32(0u),paramF32(1u),paramF32(2u))*a,a);}'});constants.set(init.gpu,kernel);void kernel.catch(()=>constants.delete(init.gpu));}
 return init.gpu.run(await kernel,[],{parameters:Float32Array.from(rgba),output:{width:init.width,height:init.height,format,alpha:'premultiplied',color:linear709},signal});
}
export function publishImage(init:CreationInit,image:GpuPixelImage,format:'rgba16float'|'rgba32float',signal?:AbortSignal){return init.gpu.compile(prepareKernel).then(kernel=>init.gpu.run(kernel,[image],{parameters:Uint32Array.of(1,0),output:{format,alpha:'premultiplied'},signal}));}
export function interpolateImages(init:CreationInit,a:GpuPixelImage,b:GpuPixelImage,amount:number,format:'rgba16float'|'rgba32float',signal?:AbortSignal){const parameters=Float32Array.of(0,...split(amount),0);new Uint32Array(parameters.buffer)[0]=2;return init.gpu.compile(binaryKernel).then(kernel=>init.gpu.run(kernel,[a,b],{parameters:new Uint32Array(parameters.buffer),output:{format,alpha:'premultiplied'},signal}));}
export function placement(o:Transform,c:FrameContext,width:number,height:number){
 const t={id:'creator-placement',start:0,end:1,x:scalar(o.x??0,c,'x'),y:scalar(o.y??0,c,'y'),scale:scalar(o.scale??1,c,'scale'),scaleX:scalar(o.scaleX??1,c,'scaleX'),scaleY:scalar(o.scaleY??1,c,'scaleY'),rotation:scalar(o.rotation??0,c,'rotation'),originX:o.originX??width/2,originY:o.originY??height/2};
 if(!Number.isFinite(t.originX)||!Number.isFinite(t.originY))fail('Finite pixel anchor required');return {matrix:matrix(t),opacity:scalar(o.opacity??1,c,'opacity',0,1),collapsed:t.scale*t.scaleX===0||t.scale*t.scaleY===0,identity:t.x===0&&t.y===0&&t.scale*t.scaleX===1&&t.scale*t.scaleY===1&&t.rotation%360===0};
}
export async function textureQuad(init:CreationInit){
 const owned:GpuDataBuffer[]=[];try{
  const indices=await init.gpu.createBuffer({type:'u32',length:6},Uint32Array.of(0,1,2,0,2,3));owned.push(indices);
  const uvs=await init.gpu.createField({type:'f32',dimensions:[4,1,1],components:2,semantic:'generic',space:'uv-top-left',units:'dimensionless'},Float32Array.of(0,0,1,0,1,1,0,1));owned.push(uvs);
  return {async render(source:GpuPixelImage,t:ReturnType<typeof placement>,fit:'contain'|'cover'|'stretch',format:'rgba16float'|'rgba32float',sampling:'linear'|'nearest',signal?:AbortSignal){
   const w=init.width,h=init.height,sw=source.info.width,sh=source.info.height,s=fit==='cover'?Math.max(w/sw,h/sh):Math.min(w/sw,h/sh),sx=fit==='stretch'?w/sw:s,sy=fit==='stretch'?h/sh:s,ox=(w-sw*sx)/2,oy=(h-sh*sy)/2,m=t.matrix;
   const points=[[0,0],[sw,0],[sw,sh],[0,sh]].flatMap(([x,y])=>{x=x*sx+ox;y=y*sy+oy;return [2*(m[0]*x+m[2]*y+m[4])/w-1,1-2*(m[1]*x+m[3]*y+m[5])/h,.5];});
   if(points.some(v=>!Number.isFinite(Math.fround(v))||v!==0&&Math.fround(v)===0))fail('Placement exceeds representable clip coordinates');
   const positions=await init.gpu.createField({type:'f32',dimensions:[4,1,1],components:3,semantic:'position',space:'clip',units:'normalized'},Float32Array.from(points));
   try{return await init.gpu.drawMesh({positions,indices,texture:{version:1,image:source,uvs,filter:sampling,addressU:'transparent',addressV:'transparent'},output:{width:w,height:h,format,alpha:'premultiplied',color:linear709}});}finally{await init.gpu.releaseBuffer(positions);}
  },async dispose(){const result=await Promise.allSettled(owned.splice(0).map(b=>init.gpu.releaseBuffer(b))),errors=result.filter((r):r is PromiseRejectedResult=>r.status==='rejected');if(errors.length)throw new AggregateError(errors.map(r=>r.reason),'Creator quad cleanup failed');}};
 }catch(error){await Promise.allSettled(owned.map(b=>init.gpu.releaseBuffer(b)));throw error;}
}
