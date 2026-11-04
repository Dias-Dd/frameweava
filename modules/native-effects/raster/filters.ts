import type {FrameContext} from '../../../src/core/types.ts';
import {assertColor,type AlphaMode,type ColorEncoding} from '../../../src/media/surface.ts';
import type {NativeStageInit,NativeGpuScope} from '../../native-gpu/authoring.ts';
import type {GpuPixelScope,GpuPixelImage,GpuPixelImageInfo,GpuPixelKernelSourceV1} from '../../gpu-effects/pixel-types.ts';
import {samePixelColor} from '../../gpu-effects/pixel-shader.ts';
import {createGpuPixelEffects} from '../../gpu-effects/pixel-effects.ts';
import {createNativeRecipeProcessor} from '../images.ts';
import {nativeWorkingImage} from '../color.ts';
import {resolveEffect,fail,type ImageEffectOptions,type BlurOptions,type GlowOptions} from '../../gpu-image-effects/parameters.ts';
import {resolveMatte,type FeatherOptions,type FillOptions,type ApplyMatteOptions,type MergeMatteOptions,type AlphaToRgbOptions,type DropShadowOptions} from '../../gpu-image-effects/matte-parameters.ts';
import {resolveReframe,type ReframeOptions} from '../../gpu-image-effects/reframe.ts';
import {resolveTile,repeatPeriod,repeatPhase,type TileOptions} from '../../gpu-image-effects/tile-parameters.ts';
import {resolveExposure,type ExposureOptions} from '../../gpu-image-effects/exposure.ts';
import {resolveOffsetRgb,type OffsetRgbOptions} from '../../gpu-image-effects/offset-rgb.ts';
import {resolveOver,type OverOptions} from '../../gpu-image-effects/over.ts';
import {resolveScreen,type ScreenOptions} from '../../gpu-image-effects/screen.ts';
import {resolveMultiply,type MultiplyOptions} from '../../gpu-image-effects/multiply.ts';
import {resolveCrossfade,type CrossfadeOptions} from '../../gpu-image-effects/crossfade.ts';
import {resolveAdd,type AddOptions} from '../../gpu-image-effects/add.ts';
import {resolveInvert,type InvertOptions} from '../../gpu-image-effects/invert.ts';
import {resolveModulate,type ModulateOptions} from '../../gpu-image-effects/modulate.ts';
import {resolveFlattenBlack,type FlattenBlackOptions} from '../../gpu-image-effects/flatten.ts';
import {resolveInvertMatte,type InvertMatteOptions} from '../../gpu-image-effects/invert-matte.ts';
import {resolveSubtractMatte,type SubtractMatteOptions} from '../../gpu-image-effects/subtract-matte.ts';
import {resolveReplaceMatte,type ReplaceMatteOptions} from '../../gpu-image-effects/replace-matte.ts';
import {prepareKernel,unaryKernel,binaryKernel,blendKernel,matteKernel,alphaKernel,reframeKernel,tileKernel,shadowKernel} from './kernels.ts';

/** Additive resident counterpart of the legacy Surface facade. The parameters
 * and Signals are the original ones; GPU handles stay within this Stage. */
export interface NativeRasterFilters {
 blur(input:GpuPixelImage,options?:BlurOptions):Promise<GpuPixelImage>;
 glow(input:GpuPixelImage,options?:GlowOptions):Promise<GpuPixelImage>;
 feather(input:GpuPixelImage,options?:FeatherOptions):Promise<GpuPixelImage>;
 fill(input:GpuPixelImage,options?:FillOptions):Promise<GpuPixelImage>;
 applyMatte(input:GpuPixelImage,matte:GpuPixelImage,options?:ApplyMatteOptions):Promise<GpuPixelImage>;
 dropShadow(input:GpuPixelImage,options?:DropShadowOptions):Promise<GpuPixelImage>;
 reframe(input:GpuPixelImage,options?:ReframeOptions):Promise<GpuPixelImage>;
 mergeMatte(first:GpuPixelImage,second:GpuPixelImage,options?:MergeMatteOptions):Promise<GpuPixelImage>;
 alphaToRGB(input:GpuPixelImage,options?:AlphaToRgbOptions):Promise<GpuPixelImage>;
 flattenBlack(input:GpuPixelImage,options?:FlattenBlackOptions):Promise<GpuPixelImage>;
 tile(input:GpuPixelImage,options?:TileOptions):Promise<GpuPixelImage>;
 exposure(input:GpuPixelImage,options?:ExposureOptions):Promise<GpuPixelImage>;
 invert(input:GpuPixelImage,options?:InvertOptions):Promise<GpuPixelImage>;
 add(first:GpuPixelImage,second:GpuPixelImage,options?:AddOptions):Promise<GpuPixelImage>;
 invertMatte(input:GpuPixelImage,options?:InvertMatteOptions):Promise<GpuPixelImage>;
 replaceMatte(input:GpuPixelImage,matte:GpuPixelImage,options?:ReplaceMatteOptions):Promise<GpuPixelImage>;
 modulate(input:GpuPixelImage,gains:GpuPixelImage,options?:ModulateOptions):Promise<GpuPixelImage>;
 over(foreground:GpuPixelImage,background:GpuPixelImage,options?:OverOptions):Promise<GpuPixelImage>;
 screen(foreground:GpuPixelImage,background:GpuPixelImage,options?:ScreenOptions):Promise<GpuPixelImage>;
 multiply(foreground:GpuPixelImage,background:GpuPixelImage,options?:MultiplyOptions):Promise<GpuPixelImage>;
 offsetRGB(input:GpuPixelImage,options?:OffsetRgbOptions):Promise<GpuPixelImage>;
 subtractMatte(first:GpuPixelImage,second:GpuPixelImage,options?:SubtractMatteOptions):Promise<GpuPixelImage>;
 crossfade(first:GpuPixelImage,second:GpuPixelImage,options?:CrossfadeOptions):Promise<GpuPixelImage>;
}
export const nativeRasterEffectNames=['blur','glow','feather','fill','applyMatte','dropShadow','reframe','mergeMatte','alphaToRGB','flattenBlack','tile','exposure','invert','add','invertMatte','replaceMatte','modulate','over','screen','multiply','offsetRGB','subtractMatte','crossfade'] as const satisfies readonly (keyof NativeRasterFilters)[];
const split=(v:number)=>{const hi=Math.fround(v);return [hi,Math.fround(v-hi)];};
type Output=Omit<GpuPixelImageInfo,'version'>;
const association=(a:AlphaMode)=>a==='premultiplied'?1:a==='straight'?2:0;
function dimensions(a:GpuPixelImage,b:GpuPixelImage){if(a.info.width!==b.info.width||a.info.height!==b.info.height)fail('E_GPU_IMAGE_SIZE','Matching dimensions required; reframe or resample explicitly');}
/** Keep the original parameter resolvers. No legacy compositor/Host is created. */
export function createNativeRasterEffects(init:Pick<NativeStageInit,'gpu'>){
 return createNativeRecipeProcessor<NativeRasterFilters>(init,(scope,context,track,signal)=>rasterFilters(scope,context,track,signal));
}
export function rasterFilters(scope:NativeGpuScope,context?:FrameContext,track:(v:GpuPixelImage)=>GpuPixelImage=v=>v,signal?:AbortSignal):NativeRasterFilters{
 const pixel=createGpuPixelEffects(scope);
 const active=(s?:AbortSignal)=>{if(s?.aborted||signal?.aborted)fail('E_RENDER_CANCELLED','Native raster effect cancelled before recording');};
 function output(input:GpuPixelImage,o:ImageEffectOptions={},alpha:AlphaMode=input.info.alpha,width=input.info.width,height=input.info.height,slots=3):Output{
  active(o.signal);const color=o.workingColor??input.info.color,format=o.format??input.info.format;alpha=o.alpha??alpha;
  assertColor(color);if(color.transfer!=='linear'||color.reference!=='scene')fail('E_GPU_IMAGE_COLOR','Native resident effects require scene-linear working colour');
  if(!['rgba16float','rgba32float'].includes(format))fail('E_GPU_IMAGE_PRECISION','Output must remain RGBA16F/32F');
  if(!['premultiplied','straight','opaque'].includes(alpha))fail('E_MEDIA_ALPHA','Invalid output Alpha');
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1)fail('E_GPU_IMAGE_SIZE','Positive safe output dimensions required');
  if(o.maxBufferBytes!==undefined){const b=o.maxBufferBytes;if(!Number.isSafeInteger(b)||b<1024||b>1024**3)fail('E_GPU_IMAGE_BUDGET','maxBufferBytes requires 1KiB..1GiB');
   // Resident storage is F32 even for logical Half. Respect the requested
   // operation budget; the owner separately enforces device/session limits.
   if((Math.max(width*height,input.info.width*input.info.height)*16*slots)>b)fail('E_GPU_IMAGE_BUDGET','Resident operation exceeds maxBufferBytes; increase the explicit budget (legacy CPU tiled transport is not used)');}
  return {width,height,color,format,alpha};
 }
 function opaque(out:Output,proven:boolean){if(out.alpha==='opaque'&&!proven)fail('E_NATIVE_EFFECTS_ALPHA','Opaque output requires structurally proven full coverage; use premultiplied/straight when coverage needs pixel inspection');}
 async function run(k:GpuPixelKernelSourceV1,inputs:readonly GpuPixelImage[],p:Uint32Array|Float32Array,out:Output,s?:AbortSignal){active(s);const working:GpuPixelImage[]=[];for(const image of inputs)working.push(await nativeWorkingImage(scope,image,out.color,s??signal));return track(await scope.run(await scope.compile(k),working,{parameters:p,output:out,signal:s??signal}));}
 async function prepare(input:GpuPixelImage,out:Output,mode:0|1|2=0,canonical=false,final=false,s?:AbortSignal){
  input=await nativeWorkingImage(scope,input,out.color,s??signal);
  const p=Uint32Array.of(mode,Number(canonical));
  const alpha=mode===1?'premultiplied':mode===2?'straight':input.info.alpha;
  return run(prepareKernel,[input],p,{...out,width:input.info.width,height:input.info.height,alpha:final?out.alpha:alpha,format:final?out.format:'rgba32float'},s);
 }
 async function finish(input:GpuPixelImage,out:Output,s?:AbortSignal){return prepare(input,out,input.info.alpha==='opaque'||out.alpha==='opaque'||input.info.alpha===out.alpha?0:association(out.alpha),false,true,s);}
 async function unary(input:GpuPixelImage,o:ImageEffectOptions,op:number,values:number[]=[],defaultAlpha=input.info.alpha){const out=output(input,o,defaultAlpha);opaque(out,op===3||op!==4&&input.info.alpha==='opaque');const p=new Uint32Array(8),f=new Float32Array(p.buffer);p[0]=op;f.set(values,1);const source=await prepare(input,out,op===3?1:0,false,false,o.signal);return finish(await run(unaryKernel,[source],p,{...out,format:'rgba32float',alpha:op===3?'opaque':source.info.alpha},o.signal),out,o.signal);}
 async function blur(input:GpuPixelImage,o:BlurOptions|GlowOptions,glow:boolean){const r=resolveEffect(glow?'glow':'gaussian',o,context),out=output(input,r.output,input.info.alpha==='opaque'?'premultiplied':input.info.alpha,input.info.width,input.info.height,8);opaque(out,input.info.alpha==='opaque'&&(glow||r.pass.radius===0||r.pass.boundary==='clamp'));const source=await prepare(input,out,0,false,false,r.signal),options={radius:r.pass.radius,boundary:r.pass.boundary,format:'rgba32float' as const,signal:r.signal??signal};
  const result=track(await(glow&&r.pass.kind==='glow'?pixel.glow(source,{...options,threshold:r.pass.threshold,intensity:r.pass.intensity}):pixel.blur(source,options)));return finish(result,out,r.signal);}
 async function matte(input:GpuPixelImage,mask:GpuPixelImage,kind:'fill'|'applyMatte'|'alphaToRGB',o:FillOptions|ApplyMatteOptions|AlphaToRgbOptions){
  dimensions(input,mask);const r=resolveMatte(kind,o,context),out=output(input,r.output,kind==='alphaToRGB'?'opaque':input.info.alpha==='opaque'?'premultiplied':input.info.alpha),p=new Uint32Array(8),f=new Float32Array(p.buffer);p[0]=kind==='applyMatte'?0:kind==='alphaToRGB'?2:1;f.set(r.resolved.color.map(Math.fround),1);f.set(split(r.resolved.opacity),4);
  opaque(out,kind==='alphaToRGB'||input.info.alpha==='opaque'&&mask.info.alpha==='opaque'&&r.resolved.opacity===1);
  const source=kind==='applyMatte'?await prepare(input,out,1,true,false,r.signal):input;
  return finish(await run(matteKernel,[source,mask],p,{...out,format:'rgba32float',alpha:kind==='alphaToRGB'?'opaque':'premultiplied'},r.signal),out,r.signal);
 }
 async function binary(a:GpuPixelImage,b:GpuPixelImage,o:ImageEffectOptions,op:number,mix=0){
  dimensions(a,b);const out=output(a,o,op===1?a.info.alpha:'premultiplied',a.info.width,a.info.height,6);
  if(op===1&&!samePixelColor(b.info.color,out.color))fail('E_GPU_IMAGE_COLOR','Raw gain RGB must declare the exact working colour; gain Alpha is ignored');
  if(op===2&&out.alpha==='straight')fail('E_GPU_IMAGE_UNSUPPORTED','Crossfade publishes native PM/opaque');
  const fullA=a.info.alpha==='opaque',fullB=b.info.alpha==='opaque';opaque(out,op===0||op===4?fullA||fullB:op===1?fullA:op===2?fullA&&fullB||mix===0&&fullA||mix===1&&fullB:op===5?fullB:false);
  const recovered=op===5?await prepare(a,{...out,color:a.info.color},2,false,false,o.signal):a;
  const source=op===3||op===4?a:await prepare(recovered,out,op===0||op===2?1:0,false,false,o.signal),back=op===0||op===2?await prepare(b,out,1,false,false,o.signal):b;
  const p=new Uint32Array(4),f=new Float32Array(p.buffer);p[0]=op;f.set(split(mix),1);p[3]=Number(op===5&&out.alpha==='straight');
  const value=await run(binaryKernel,[source,back],p,{...out,format:'rgba32float',alpha:op===1?source.info.alpha:op===5&&out.alpha==='straight'?'straight':'premultiplied'},o.signal);return finish(value,out,o.signal);
 }
 async function blend(a:GpuPixelImage,b:GpuPixelImage,o:OverOptions,mode:0|2|3){const r=mode===0?resolveOver(o,context):mode===2?resolveMultiply(o,context):resolveScreen(o,context);dimensions(a,b);const out=output(b,r.output,'premultiplied',b.info.width,b.info.height,6);if(out.alpha==='straight')fail('E_GPU_IMAGE_UNSUPPORTED','Blend publishes native PM/opaque');
  opaque(out,b.info.alpha==='opaque'||a.info.alpha==='opaque'&&r.opacity===1);
  const front=await prepare(a,out,1,false,false,r.signal),back=await prepare(b,out,1,false,false,r.signal),p=new Uint32Array(4);p[0]=mode;new Float32Array(p.buffer).set(split(r.opacity),1);return run(blendKernel,[front,back],p,out,r.signal);}
 return {
  blur:(input,o={})=>blur(input,o,false),glow:(input,o={})=>blur(input,o,true),
  async feather(input,o={}){const r=resolveMatte('feather',o,context),out=output(input,r.output,'premultiplied',input.info.width,input.info.height,8);opaque(out,input.info.alpha==='opaque'&&(r.resolved.radius===0||r.resolved.boundary==='clamp'));const mask=await run(alphaKernel,[input],new Uint32Array(4),{...out,format:'rgba32float',alpha:'premultiplied'},r.signal),soft=track(await pixel.blur(mask,{radius:r.resolved.radius,boundary:r.resolved.boundary,format:'rgba32float',signal:r.signal??signal}));return finish(soft,out,r.signal);},
  fill:(input,o={})=>matte(input,input,'fill',o),applyMatte:(input,mask,o={})=>matte(input,mask,'applyMatte',o),alphaToRGB:(input,o={})=>matte(input,input,'alphaToRGB',o),
  async dropShadow(input,o={}){const r=resolveMatte('dropShadow',o,context),halo=Math.ceil(3*r.resolved.radius)+2,out=output(input,r.output,'premultiplied',input.info.width,input.info.height,10),wide=output(input,r.output,'premultiplied',input.info.width+2*halo,input.info.height+2*halo,10),p=new Float32Array(12);p.set(r.resolved.color.map(Math.fround),0);p.set(split(r.resolved.opacity),3);p.set(split(r.resolved.offset[0]),5);p.set(split(r.resolved.offset[1]),7);p[9]=halo;
   opaque(out,input.info.alpha==='opaque'&&r.resolved.opacity===1&&r.resolved.radius===0&&r.resolved.offset.every(v=>v===0));
   const far=Math.abs(r.resolved.offset[0])>input.info.width+halo||Math.abs(r.resolved.offset[1])>input.info.height+halo;new Uint32Array(p.buffer)[10]=Number(far);
   const padded=await run(alphaKernel,[input],Uint32Array.of(halo,halo,0,0),{...wide,format:'rgba32float',alpha:'premultiplied'},r.signal),soft=track(await pixel.blur(padded,{radius:r.resolved.radius,boundary:'transparent',format:'rgba32float',signal:r.signal??signal}));
   return finish(await run(shadowKernel,[soft],p,{...out,format:'rgba32float',alpha:'premultiplied'},r.signal),out,r.signal);
  },
  async reframe(input,o={}){const r=resolveReframe(input.info,o,context),v=r.resolved,out=output(input,r.output,input.info.alpha==='opaque'?'premultiplied':input.info.alpha,v.width,v.height);opaque(out,input.info.alpha==='opaque'&&v.x>=0&&v.y>=0&&v.x+v.width<=input.info.width&&v.y+v.height<=input.info.height);const source=await prepare(input,out,1,true,false,r.signal),outside=v.x>=input.info.width||v.x+v.width<=0||v.y>=input.info.height||v.y+v.height<=0;
   // Intersection proves these offsets fit the owner's i32 coordinate range.
   const p=Uint32Array.of(outside?0:v.x>>>0,outside?0:v.y>>>0,Number(v.flipX),Number(v.flipY),Number(outside),0);
   return finish(await run(reframeKernel,[source],p,{...out,format:'rgba32float',alpha:'premultiplied'},r.signal),out,r.signal);
  },
  async tile(input,o={}){const r=resolveTile(input.info,o,context),v=r.resolved,out=output(input,r.output,input.info.alpha,v.width,v.height);opaque(out,input.info.alpha==='opaque');const source=input,p=Uint32Array.of(repeatPhase(0,v.offset[0],repeatPeriod(input.info.width,v.mode)),repeatPhase(0,v.offset[1],repeatPeriod(input.info.height,v.mode)),Number(v.mode==='mirror'),0);
   const copy=await run(tileKernel,[source],p,{...out,format:out.alpha===source.info.alpha?out.format:'rgba32float',alpha:source.info.alpha},r.signal);return out.alpha===source.info.alpha?copy:finish(copy,out,r.signal);
  },
  exposure:async(input,o={})=>{const r=resolveExposure(o,context);return unary(input,{...r.output,signal:r.signal},0,[r.gain]);},
  invert:async(input,o={})=>{resolveInvert(o);return unary(input,o,1);},
  offsetRGB:async(input,o={})=>{const r=resolveOffsetRgb(o,context);return unary(input,{...r.output,signal:r.signal},2,[...r.offset]);},
  flattenBlack:async(input,o={})=>{resolveFlattenBlack(o);return unary(input,o,3,[],'opaque');},
  invertMatte:async(input,o={})=>{resolveInvertMatte(o);return unary(input,o,4,[],'premultiplied');},
  add:async(a,b,o={})=>{resolveAdd(o);return binary(a,b,o,0);},
  modulate:async(a,b,o={})=>{resolveModulate(o);return binary(a,b,o,1);},
  crossfade:async(a,b,o={})=>{const r=resolveCrossfade(o,context);return binary(a,b,{...r.output,signal:r.signal},2,r.mix);},
  subtractMatte:async(a,b,o={})=>{resolveSubtractMatte(o);return binary(a,b,o,3);},
  mergeMatte:async(a,b,o={})=>{resolveMatte('mergeMatte',o,context);return binary(a,b,o,4);},
  replaceMatte:async(a,b,o={})=>{resolveReplaceMatte(o);return binary(a,b,o,5);},
  over:(a,b,o={})=>blend(a,b,o,0),screen:(a,b,o={})=>blend(a,b,o,3),multiply:(a,b,o={})=>blend(a,b,o,2),
 };
}
