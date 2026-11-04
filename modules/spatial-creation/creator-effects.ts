import {withGpuResources,type GpuResourceArena} from '../gpu-effects/resource-arena.ts';
import {rasterFilters} from '../native-effects/raster/filters.ts';
import {createPaFilters,split,type NativePaImageFilters} from '../native-effects/pa/filters.ts';
import {alphaKernel,shadowKernel,prepareKernel} from '../native-effects/raster/kernels.ts';
import {resolveMatte,type DropShadowOptions} from '../gpu-image-effects/matte-parameters.ts';
import {createProfessionalFilters} from '../gpu-image-effects/resident/filters.ts';
import type {NativeGpuScope} from '../native-gpu/authoring.ts';
import type {GpuPixelImage} from '../gpu-effects/pixel-types.ts';
import type {GpuDataBuffer} from '../gpu-effects/compute-types.ts';
import type {Signal,FrameContext} from '../../src/core/types.ts';
import type {CreationInit,CreationOptions} from './types.ts';
import type {CreationColor} from './colors.ts';
import {creationColor} from './colors.ts';
import {creationStage,validateCreation,fail} from './lifecycle.ts';
import {children,childImage,imageCheck,type CreationSource,type ChildOwnership} from './composition-core.ts';

export interface CreatorEffectOptions extends CreationOptions {ownership?:ChildOwnership}
export interface BlurCreationOptions extends CreatorEffectOptions {radius?:Signal<number>;boundary?:'transparent'|'clamp';maxWorkingBytes?:number}
export interface GlowCreationOptions extends BlurCreationOptions {threshold?:Signal<number>;intensity?:Signal<number>}
export interface ShadowCreationOptions extends CreatorEffectOptions {radius?:Signal<number>;offset?:readonly [Signal<number>,Signal<number>];color?:CreationColor;opacity?:Signal<number>;includeSource?:boolean;maxBufferBytes?:number}
export type InnerShadowCreationOptions=Omit<ShadowCreationOptions,'includeSource'>;
export interface OutlineCreationOptions extends CreatorEffectOptions {width?:Signal<number>;color?:CreationColor;opacity?:Signal<number>;includeSource?:boolean;boundary?:'transparent'|'clamp';maxBufferBytes?:number}
export interface SharpenCreationOptions extends CreatorEffectOptions {radius?:Signal<number>;amount?:Signal<number>;boundary?:'transparent'|'clamp'}
export interface PixelateCreationOptions extends CreatorEffectOptions {blockSize?:readonly [Signal<number>,Signal<number>];origin?:readonly [Signal<number>,Signal<number>]}
export interface ChromaKeyCreationOptions extends CreatorEffectOptions {color?:CreationColor;inner?:Signal<number>;outer?:Signal<number>;invert?:boolean}
export interface LumaKeyCreationOptions extends CreatorEffectOptions {low?:Signal<number>;high?:Signal<number>;invert?:boolean}
export interface WobbleCreationOptions extends CreatorEffectOptions {amount?:Signal<number>;frequency?:Signal<number>;speed?:Signal<number>;seed?:number;offset?:readonly [Signal<number>,Signal<number>];boundary?:'transparent'|'clamp';sampling?:'bilinear'|'nearest';maxWorkingBytes?:number}
export interface MaskCreationOptions extends CreatorEffectOptions {invert?:boolean;opacity?:Signal<number>;maxBufferBytes?:number}
type Kind='blur'|'glow'|'shadow'|'innerShadow'|'outline'|'sharpen'|'pixelate'|'chromaKey'|'lumaKey'|'wobble'|'mask';
const fields:Record<Kind,readonly string[]>={blur:['radius','boundary','maxWorkingBytes'],glow:['radius','boundary','maxWorkingBytes','threshold','intensity'],shadow:['radius','offset','color','opacity','includeSource','maxBufferBytes'],innerShadow:['radius','offset','color','opacity','maxBufferBytes'],outline:['width','color','opacity','includeSource','boundary','maxBufferBytes'],sharpen:['radius','amount','boundary'],pixelate:['blockSize','origin'],chromaKey:['color','inner','outer','invert'],lumaKey:['low','high','invert'],wobble:['amount','frequency','speed','seed','offset','boundary','sampling','maxWorkingBytes'],mask:['invert','opacity','maxBufferBytes']};

/** Same per-call temporary-release rule as the original recipe processor,
 * using the existing arena and transferring the final image to its caller.
 * No retained output layer/copy, new owner, or cross-frame resource state. */
function effectScope(gpu:NativeGpuScope,arena:GpuResourceArena,track:(v:GpuPixelImage)=>GpuPixelImage){
 const images=new Set<GpuPixelImage>(),released=new WeakSet<GpuPixelImage>(),buffers=new Set<GpuDataBuffer>(),releasedBuffers=new WeakSet<GpuDataBuffer>();
 return new Proxy(gpu,{get(target,key){
  if(key==='run')return async(...args:Parameters<NativeGpuScope['run']>)=>{const image=await target.run(...args);images.add(image);return track(image);};
  if(key==='release')return async(image:GpuPixelImage)=>{if(images.has(image)){if(released.has(image))return;await target.release(image);arena.keep(image);released.add(image);}else await target.release(image);};
  if(key==='createField')return async(...args:Parameters<NativeGpuScope['createField']>)=>{const b=await target.createField(...args);arena.buffer(b);buffers.add(b);return b;};
  if(key==='releaseBuffer')return async(b:GpuDataBuffer)=>{if(buffers.has(b)){if(releasedBuffers.has(b))return;await target.releaseBuffer(b);arena.keep(b);releasedBuffers.add(b);}else await target.releaseBuffer(b);};
  const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
 }}) as NativeGpuScope;
}
/** Original padded-Alpha/translation/tint recipe, with the already qualified
 * Native PA Gaussian. Legacy raster.blur rejects tiny nonzero Alpha; ordinary
 * blurred outlines legitimately produce it. Preserve it instead of clipping.
 * Same parameter resolver, halo, bilinear sampler and publication boundaries. */
async function softShadow(gpu:NativeGpuScope,pa:NativePaImageFilters,input:GpuPixelImage,o:DropShadowOptions,c:FrameContext){
 const r=resolveMatte('dropShadow',o,c),v=r.resolved,halo=Math.ceil(3*v.radius)+2,width=input.info.width+2*halo,height=input.info.height+2*halo;
 if(o.maxBufferBytes!==undefined&&(!Number.isSafeInteger(o.maxBufferBytes)||o.maxBufferBytes<1024||o.maxBufferBytes>1024**3||width*height*16*10>o.maxBufferBytes))fail('Shadow resident scratch exceeds maxBufferBytes','E_GPU_IMAGE_BUDGET');
 const info={width:input.info.width,height:input.info.height,color:input.info.color,alpha:'premultiplied' as const,format:'rgba32float' as const},p=new Float32Array(12);p.set(v.color.map(Math.fround),0);p.set(split(v.opacity),3);p.set(split(v.offset[0]),5);p.set(split(v.offset[1]),7);p[9]=halo;new Uint32Array(p.buffer)[10]=Number(Math.abs(v.offset[0])>input.info.width+halo||Math.abs(v.offset[1])>input.info.height+halo);
 const padded=await gpu.run(await gpu.compile(alphaKernel),[input],{parameters:Uint32Array.of(halo,halo,0,0),output:{...info,width,height},signal:o.signal});
 const soft=await pa.blur(padded,{radius:v.radius,boundary:'transparent',format:'rgba32float',alpha:'premultiplied',signal:o.signal});
 const tinted=await gpu.run(await gpu.compile(shadowKernel),[soft],{parameters:p,output:info,signal:o.signal});
 return gpu.run(await gpu.compile(prepareKernel),[tinted],{parameters:Uint32Array.of(0,0),output:{...info,format:o.format??input.info.format},signal:o.signal});
}
async function effect(init:CreationInit,sources:readonly CreationSource[],options:CreatorEffectOptions,kind:Kind){
 validateCreation(init,options,['ownership',...fields[kind]]);const {post,signal,...raw}=options;let o:typeof raw;
 try{o=structuredClone(raw);}catch{fail('Creator effects require serializable parameters and Core Signals');}
 const p=Object.fromEntries(fields[kind].filter(k=>Object.hasOwn(o,k)).map(k=>[k,(o as any)[k]]));
 if(p.includeSource!==undefined&&typeof p.includeSource!=='boolean'||p.invert!==undefined&&typeof p.invert!=='boolean')fail('includeSource/invert must be boolean');
 return withGpuResources(init.gpu,async initArena=>{
  const owner=initArena.adopt(await children(sources,o.ownership),x=>x.dispose());
  const stage=creationStage(init,{...o,post,signal},async(c,inputs,props)=>withGpuResources(init.gpu,async a=>{
   const owned=new Set<GpuPixelImage>(),track=(image:GpuPixelImage)=>{if(!owned.has(image)){a.image(image);owned.add(image);}return image;};
   const images:GpuPixelImage[]=[];for(const [index,child]of owner.items.entries()){const image=track(await childImage(child,index,init,c,inputs,props));imageCheck(image,init);images.push(image);}
   const scope=effectScope(init.gpu,a,track),fx=createProfessionalFilters(scope,c,track,signal),pa=createPaFilters(scope,c,track,signal),raster=rasterFilters(scope,c,track,signal),input=images[0],format=o.format??'rgba32float',out={format,signal},native={...out,alpha:'premultiplied' as const};let result:GpuPixelImage;
   switch(kind){
    case 'blur':result=await pa.blur(input,{radius:3,...p,...native});break;
    case 'glow':result=await pa.glow(input,{radius:4,intensity:.6,threshold:.7,...p,...native});break;
    case 'shadow':{const {includeSource=true,color='#000000',...params}=p,shadow=await softShadow(scope,pa,input,{radius:4,offset:[6,8],opacity:.5,...params,color:creationColor(color,c,'shadow color'),...native},c);result=includeSource?await raster.over(input,shadow,native):shadow;break;}
    case 'innerShadow':result=await pa.innerShadow(input,{radius:4,offset:[4,4],opacity:.5,...p,color:creationColor(p.color??'#000000',c,'inner shadow color'),...native});break;
    case 'outline':{const {width=2,color='#ffffff',opacity=1,includeSource=true,boundary='transparent',maxBufferBytes}=p,expanded=await fx.morphology(input,{operation:'dilate',radius:width,boundary,...out}),ring=await raster.subtractMatte(expanded,input,native),ink=await raster.fill(ring,{color:creationColor(color,c,'outline color'),opacity,maxBufferBytes,...native});result=includeSource?await raster.over(input,ink,native):ink;break;}
    case 'sharpen':result=await fx.unsharpMask(input,{radius:1.5,amount:.5,...p,...out});break;
    case 'pixelate':result=await fx.pixelate(input,{blockSize:[6,6],...p,...out});break;
    case 'chromaKey':result=await fx.chromaKey(input,{inner:.1,outer:.3,...p,color:creationColor(p.color??'#00ff00',c,'key color'),...out});break;
    case 'lumaKey':result=await fx.lumaKey(input,{low:.15,high:.6,...p,...out});break;
    case 'wobble':result=await pa.displacement(input,{amount:8,frequency:3,speed:.8,...p,...native});break;
    case 'mask':{const {invert=false,...params}=p,mask=invert?await raster.invertMatte(images[1],native):images[1];result=await raster.applyMatte(input,mask,{...params,...native});break;}
   }
   return a.keep(track(result));
  }),()=>owner.dispose(),()=>({kind:'creator-effect',effect:kind,children:owner.items.length,ownership:o.ownership??'owned',operator:'original Native PA / raster / professional GPU factories',copy:'no retained-result copy or CPU pixel transport',completion:'recorded-only; Session owns queue completion/recycling'}));
  initArena.keep(owner);return stage;
 });
}
export function blurCreation(init:CreationInit,source:CreationSource,o:BlurCreationOptions={}){return effect(init,[source],o,'blur');}
export function glowCreation(init:CreationInit,source:CreationSource,o:GlowCreationOptions={}){return effect(init,[source],o,'glow');}
export function shadowCreation(init:CreationInit,source:CreationSource,o:ShadowCreationOptions={}){return effect(init,[source],o,'shadow');}
export function innerShadowCreation(init:CreationInit,source:CreationSource,o:InnerShadowCreationOptions={}){return effect(init,[source],o,'innerShadow');}
export function outlineCreation(init:CreationInit,source:CreationSource,o:OutlineCreationOptions={}){return effect(init,[source],o,'outline');}
export function sharpenCreation(init:CreationInit,source:CreationSource,o:SharpenCreationOptions={}){return effect(init,[source],o,'sharpen');}
export function pixelateCreation(init:CreationInit,source:CreationSource,o:PixelateCreationOptions={}){return effect(init,[source],o,'pixelate');}
export function chromaKeyCreation(init:CreationInit,source:CreationSource,o:ChromaKeyCreationOptions={}){return effect(init,[source],o,'chromaKey');}
export function lumaKeyCreation(init:CreationInit,source:CreationSource,o:LumaKeyCreationOptions={}){return effect(init,[source],o,'lumaKey');}
export function wobbleCreation(init:CreationInit,source:CreationSource,o:WobbleCreationOptions={}){return effect(init,[source],o,'wobble');}
export function maskCreation(init:CreationInit,source:CreationSource,mask:CreationSource,o:MaskCreationOptions={}){return effect(init,[source,mask],o,'mask');}
