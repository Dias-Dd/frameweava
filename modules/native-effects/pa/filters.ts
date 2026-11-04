import {EngineError} from '../../../src/core/errors.ts';
import {evaluate} from '../../../src/core/animation.ts';
import type {FrameContext,Signal} from '../../../src/core/types.ts';
import {assertColor,linear709,type AlphaMode} from '../../../src/media/surface.ts';
import {gamutMatrix} from '../../../src/media/color.ts';
import type {NativeStageInit,NativeGpuScope} from '../../native-gpu/authoring.ts';
import type {GpuDataBuffer} from '../../gpu-effects/compute-types.ts';
import type {GpuPixelImage,GpuPixelImageInfo,GpuPixelScope,GpuPixelKernelSource} from '../../gpu-effects/pixel-types.ts';
import {samePixelColor} from '../../gpu-effects/pixel-shader.ts';
import type {FloatEffectOptions,BlurOptions,GlowOptions,DisplacementOptions} from '../../pro-animation/src/professional.ts';
import type {MapWarpOptions} from '../../pro-animation/src/procedural.ts';
import type {CoverageOptions} from '../../pro-animation/src/coverage.ts';
import {resolveMatte,type DropShadowOptions} from '../../gpu-image-effects/matte-parameters.ts';
import {prepareKernel} from '../raster/kernels.ts';
import {createNativeRecipeProcessor} from '../images.ts';
import {nativeWorkingImage} from '../color.ts';
import * as kernel from './kernels.ts';
export type NativePaOptions<T>=T&{signal?:AbortSignal};
export type InnerShadowOptions=Omit<DropShadowOptions,'alpha'>&{alpha?:'premultiplied'|'opaque'};
export interface NativePaImageFilters {
 blur(input:GpuPixelImage,options:NativePaOptions<BlurOptions>):Promise<GpuPixelImage>;
 glow(input:GpuPixelImage,options:NativePaOptions<GlowOptions>):Promise<GpuPixelImage>;
 displacement(input:GpuPixelImage,options:NativePaOptions<DisplacementOptions>):Promise<GpuPixelImage>;
 displaceWithMap(input:GpuPixelImage,map:GpuPixelImage,options:NativePaOptions<MapWarpOptions>):Promise<GpuPixelImage>;
 surfaceFromCoverage(coverage:ArrayLike<number>,options:NativePaOptions<CoverageOptions>):Promise<GpuPixelImage>;
 innerShadow(input:GpuPixelImage,options?:InnerShadowOptions):Promise<GpuPixelImage>;
}
export const nativePaImageNames=['blur','glow','displacement','displaceWithMap','surfaceFromCoverage','innerShadow'] as const satisfies readonly (keyof NativePaImageFilters)[];
type Output=Omit<GpuPixelImageInfo,'version'>;
export const split=(v:number)=>{const high=Math.fround(v);return [high,Math.fround(v-high)];};
const fail=(code:string,message:string):never=>{throw new EngineError(code,message);};
export function createNativePaImageEffects(init:Pick<NativeStageInit,'gpu'>){return createNativeRecipeProcessor<NativePaImageFilters>(init,(gpu,context,track,signal)=>createPaFilters(gpu,context,track,signal));}
export function createPaFilters(g:NativeGpuScope,context?:FrameContext,track:(v:GpuPixelImage)=>GpuPixelImage=v=>v,signal?:AbortSignal):NativePaImageFilters{
 const active=(s?:AbortSignal)=>{if(signal?.aborted||s?.aborted)fail('E_RENDER_CANCELLED','Native PA effect cancelled before recording');};
 function fields(o:object,extra:readonly string[],common=true){if(!o||typeof o!=='object'||Array.isArray(o)||Object.keys(o).some(k=>![...common?['workingColor','format','alpha','maxWorkingBytes','signal']:[],...extra].includes(k)))fail('E_PA_PARAMETER','Unknown professional effect option');const s=(o as {signal?:AbortSignal}).signal;if(s!==undefined&&!(s instanceof AbortSignal))fail('E_PA_PARAMETER','signal must be an AbortSignal');active(s);}
 function scalar(v:Signal<number>,name:string,min:number,max:number){if(typeof v!=='number'&&!context)fail('E_PA_CONTEXT',`${name} Signal requires FrameContext`);const n=typeof v==='number'?v:evaluate(v,context!);if(typeof n!=='number'||!Number.isFinite(n)||n<min||n>max)fail('E_PA_PARAMETER',`${name} must be finite in [${min},${max}]`);return n;}
 const edge=(v:unknown):'transparent'|'clamp'=>{if(v===undefined)return 'transparent';if(v==='transparent'||v==='clamp')return v;return fail('E_PA_PARAMETER','Unknown sampling boundary');};
 function output(input:GpuPixelImage,o:NativePaOptions<FloatEffectOptions>,slots:number,full=false):Output{
  active(o.signal);const color=o.workingColor??input.info.color,format=o.format??input.info.format,alpha=o.alpha??(input.info.alpha==='opaque'?'premultiplied':input.info.alpha);assertColor(color);
  if(color.transfer!=='linear'||color.reference!=='scene')fail('E_PA_WORKING_COLOR','An explicit scene-linear working colour is required');
  if(!['rgba16float','rgba32float'].includes(format))fail('E_PA_PRECISION','Output must remain RGBA16F/32F');if(!['straight','premultiplied','opaque'].includes(alpha))fail('E_MEDIA_ALPHA','Invalid output Alpha');
  if(alpha==='opaque'&&!full)fail('E_NATIVE_EFFECTS_ALPHA','Opaque result must be structurally proven; Native has no implicit numerical scan');
  if(o.maxWorkingBytes!==undefined&&(!Number.isSafeInteger(o.maxWorkingBytes)||o.maxWorkingBytes<1024||input.info.width*input.info.height*16*slots>o.maxWorkingBytes))fail('E_PA_LIMIT','Resident effect exceeds explicit maxWorkingBytes');
  return {...input.info,format,alpha,color};
 }
 async function run(k:GpuPixelKernelSource,inputs:readonly GpuPixelImage[],out:Output,parameters:Float32Array|Uint32Array=new Float32Array(0),s?:AbortSignal,data?:readonly GpuDataBuffer[]){active(s);const working:GpuPixelImage[]=[];for(const image of inputs)working.push(await nativeWorkingImage(g,image,out.color,s??signal));return track(await g.run(await g.compile(k),working,{output:out,parameters,signal:s??signal,...data?{data}:{}}));}
 const pm=(input:GpuPixelImage,color:Output['color'],s?:AbortSignal)=>run(kernel.canonical,[input],{...input.info,color,format:'rgba32float',alpha:'premultiplied'},new Float32Array(0),s);
 const publish=(input:GpuPixelImage,out:Output,s?:AbortSignal)=>run(prepareKernel,[input],out,Uint32Array.of(out.alpha==='straight'?2:0,0),s);
 async function gaussian(input:GpuPixelImage,sigma:number,boundary:'transparent'|'clamp',s?:AbortSignal){const radius=Math.ceil(3*sigma),weights=sigma===0?[1]:Array.from({length:2*radius+1},(_,i)=>Math.exp(-.5*((i-radius)/sigma)**2)),sum=weights.reduce((a,b)=>a+b,0),p=new Uint32Array(774);p[0]=radius;p[2]=Number(boundary==='clamp');new Float32Array(p.buffer).set(weights.flatMap(w=>split(w/sum)),4);const out={...input.info,format:'rgba32float' as const,alpha:'premultiplied' as const},h=await run(kernel.gaussian,[input],out,p,s);p[1]=1;return run(kernel.gaussian,[h],out,p,s);}
 return {
  async blur(input,o){fields(o,['radius','boundary']);const radius=scalar(o.radius,'radius (sigma px)',0,64),boundary=edge(o.boundary),out=output(input,o,5,input.info.alpha==='opaque'&&(radius===0||boundary==='clamp')),prepared=await pm(input,out.color,o.signal);return publish(await gaussian(prepared,radius,boundary,o.signal),out,o.signal);},
  async glow(input,o){fields(o,['radius','boundary','threshold','intensity']);const radius=scalar(o.radius,'radius (sigma px)',0,64),boundary=edge(o.boundary),threshold=scalar(o.threshold??1,'threshold (working white units)',0,1e6),intensity=scalar(o.intensity,'intensity',0,100),out=output(input,o,8,input.info.alpha==='opaque'),prepared=await pm(input,out.color,o.signal);if(intensity===0)return publish(prepared,out,o.signal);
   const matrix=gamutMatrix(out.color,{...linear709,referenceWhiteNits:out.color.referenceWhiteNits}),luma=[0,1,2].map(c=>.2126*matrix[0][c]+.7152*matrix[1][c]+.0722*matrix[2][c]),bright=await run(kernel.threshold,[prepared],{...out,format:'rgba32float',alpha:'premultiplied'},Float32Array.from([...([threshold,...luma].flatMap(split)),0]),o.signal),bloom=await gaussian(bright,radius,boundary,o.signal),combined=await run(kernel.combine,[prepared,bloom],{...out,format:'rgba32float',alpha:'premultiplied'},Float32Array.from([...split(intensity),0]),o.signal);return publish(combined,out,o.signal);
  },
  async displacement(input,o){fields(o,['amount','frequency','speed','seed','time','offset','boundary','sampling']);const amount=scalar(o.amount,'amount (px)',0,100),frequency=scalar(o.frequency??9,'frequency',.1,80),speed=scalar(o.speed??.8,'speed',-10,10),seed=o.seed??3;if(!Number.isInteger(seed)||seed<0||seed>2147483647)fail('E_PA_PARAMETER','seed must be an integer in [0,2147483647]');
   const time=scalar(o.time??context?.time??0,'time (seconds)',-1e6,1e6),boundary=edge(o.boundary),sampling=o.sampling??'bilinear';if(!['bilinear','nearest'].includes(sampling))fail('E_PA_PARAMETER','Unknown interpolation');if(o.offset&&(!Array.isArray(o.offset)||o.offset.length!==2))fail('E_PA_PARAMETER','offset needs two physical coordinates');
   const ox=scalar(o.offset?.[0]??0,'offset x',-1e6,1e6),oy=scalar(o.offset?.[1]??0,'offset y',-1e6,1e6),out=output(input,o,4,input.info.alpha==='opaque'&&(boundary==='clamp'||amount===0&&ox===0&&oy===0)),{width,height}=input.info,t=time*speed,values=new Float32Array(2*(width+height));
   // The original separable F64 sine field, O(width+height), is control data.
   // No CPU pixels, dense displacement map, image readback or GPU sin substitute.
   for(let x=0;x<width;x++)values.set(split(Math.sin(x/width*frequency*6.283+t+seed*.13)),2*x);
   for(let y=0;y<height;y++)values.set(split(Math.sin(y/height*frequency*4.2-t*.7+seed*.31)),2*(width+y));
   active(o.signal);const control=await g.createField({type:'f32',dimensions:[width+height,1,1],components:2,semantic:'generic',space:'pa.sine-control',units:'dimensionless'}),p=new Uint32Array(9);await g.writeBuffer(control,values);p[0]=Number(boundary==='clamp');p[1]=Number(sampling==='nearest');new Float32Array(p.buffer).set([amount,ox,oy].flatMap(split),2);
   const prepared=await pm(input,out.color,o.signal),warped=await run(kernel.displacement,[prepared],{...out,format:'rgba32float',alpha:'premultiplied'},p,o.signal,[control]);return publish(warped,out,o.signal);
  },
  async displaceWithMap(input,map,o){fields(o,['encoding','scale','boundary']);if(o.encoding!=='rg-offset-px')fail('E_PA_MAP_ENCODING','Explicit rg-offset-px interpretation required');if(map.info.width!==input.info.width||map.info.height!==input.info.height)fail('E_PA_SIZE','Map must match physical source dimensions');if(map.info.alpha!=='opaque'||map.info.color.transfer!=='linear')fail('E_PA_MAP_ENCODING','Map requires opaque floating linear utility channels');
   const scale=scalar(o.scale??1,'map scale',-1000,1000),boundary=edge(o.boundary),out=output(input,o,4,input.info.alpha==='opaque'&&boundary==='clamp'),p=new Uint32Array(4);if(!samePixelColor(out.color,map.info.color))fail('E_NATIVE_EFFECTS_COLOR','RG utility map must declare the exact target working encoding; offsets are never colour-converted');p[0]=Number(boundary==='clamp');new Float32Array(p.buffer).set(split(scale),2);const prepared=await pm(input,out.color,o.signal);return publish(await run(kernel.mapWarp,[prepared,map],{...out,format:'rgba32float',alpha:'premultiplied'},p,o.signal),out,o.signal);
  },
  async surfaceFromCoverage(values,o){fields(o,['width','height','ink','workingColor','format','signal'],false);const {width,height,workingColor,ink}=o;assertColor(workingColor);if(workingColor.transfer!=='linear'||workingColor.reference!=='scene')fail('E_PA_WORKING_COLOR','Coverage ink requires scene-linear colour');if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||!Number.isSafeInteger(width*height)||values.length!==width*height)fail('E_PA_SIZE','Coverage dimensions and length must agree');const limits=g.capabilities().limits;if(width*height*16>Math.min(limits.maxBufferSize,limits.maxStorageBufferBindingSize))fail('E_PA_LIMIT','Coverage image exceeds admitted device buffer limits');if(!Array.isArray(ink)||ink.length!==4||ink.some(v=>!Number.isFinite(v)||!Number.isFinite(Math.fround(v)))||ink[3]<0||ink[3]>1)fail('E_PA_PARAMETER','Finite working RGBA ink and Alpha [0,1] required');
   if(o.format!==undefined&&!['rgba16float','rgba32float'].includes(o.format))fail('E_PA_PRECISION','Coverage output must remain floating');const data=new Float32Array(values.length*2);for(let i=0;i<values.length;i++){const v=values[i];if(!Number.isFinite(v)||v<0||v>1)fail('E_PA_PARAMETER','Coverage must be finite [0,1]');data.set(split(v),2*i);}
   const buffer=await g.createField({type:'f32',dimensions:[width,height,1],components:2,semantic:'generic',channels:['coverage-high','coverage-residual'],space:'pa.raster',units:'dimensionless',metadata:{encoding:'split-f64-coverage/1'}},data);return run(kernel.coverage,[],{width,height,color:workingColor,format:o.format??'rgba32float',alpha:'premultiplied'},Float32Array.from([...([...ink.slice(0,3),ink[3]].flatMap(split)),0]),o.signal,[buffer]);
  },
  async innerShadow(input,o={}){const r=resolveMatte('dropShadow',o,context),v=r.resolved,out=output(input,{workingColor:r.output.workingColor,format:r.output.format,alpha:r.output.alpha??'premultiplied',signal:r.signal},10,false);if(out.alpha==='straight')fail('E_GPU_IMAGE_UNSUPPORTED','Inner Shadow publishes native PM/opaque only');const whole=v.offset.map(Math.floor),fraction=v.offset.map((x,i)=>x-whole[i]);if(v.color.some(c=>Math.abs(c)>65504)&&fraction.some(c=>c!==0))fail('E_GPU_FLOAT_PRECISION','Fractional shadow RGB is outside the qualified wide profile');
   const halo=Math.ceil(3*v.radius)+2,width=input.info.width+2*halo,height=input.info.height+2*halo,origin=whole.map((n,i)=>-halo-n-(fraction[i]===0?0:1));if(!origin.every((n,i)=>Number.isSafeInteger(n)&&Number.isSafeInteger(n+[width,height][i])))fail('E_GPU_IMAGE_PARAMETER','Inner Shadow ROI coordinates must remain safe integers');const outside=origin[0]>=input.info.width||origin[0]+width<=0||origin[1]>=input.info.height||origin[1]+height<=0;
   if(o.maxBufferBytes!==undefined&&(!Number.isSafeInteger(o.maxBufferBytes)||o.maxBufferBytes<1024||width*height*16*6>o.maxBufferBytes))fail('E_GPU_IMAGE_BUDGET','Inner Shadow resident scratch exceeds maxBufferBytes');
   const inverse=await run(kernel.inversePad,[input],{...out,width,height,format:'rgba32float',alpha:'premultiplied'},Uint32Array.of(outside?0:origin[0]>>>0,outside?0:origin[1]>>>0,Number(outside),0),r.signal),soft=await gaussian(inverse,v.radius,'clamp',r.signal),p=new Float32Array(11);p.set(split(v.opacity),0);p.set(v.color.map(Math.fround),2);p.set(split(fraction[0]===0?0:1-fraction[0]),5);p.set(split(fraction[1]===0?0:1-fraction[1]),7);p[9]=halo;
   return run(kernel.innerShadow,[soft,input],{...out,alpha:'premultiplied'},p,r.signal);
  },
 };
}
