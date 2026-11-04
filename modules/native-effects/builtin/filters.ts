import {EngineError} from '../../../src/core/errors.ts';
import {evaluate} from '../../../src/core/animation.ts';
import type {FrameContext,Signal} from '../../../src/core/types.ts';
import {assertColor,linear709} from '../../../src/media/surface.ts';
import {gamutMatrix} from '../../../src/media/color.ts';
import {matrix,invert} from '../../../src/media/compositor-geometry.ts';
import type {NativeStageInit,NativeGpuScope} from '../../native-gpu/authoring.ts';
import type {GpuPixelImage,GpuPixelKernelSource,GpuPixelImageInfo} from '../../gpu-effects/pixel-types.ts';
import type {GpuDataBuffer} from '../../gpu-effects/compute-types.ts';
import {createNativeRecipeProcessor} from '../images.ts';
import {nativeWorkingImage} from '../color.ts';
import {createPaFilters,split} from '../pa/filters.ts';
import {prepareKernel} from '../raster/kernels.ts';
import {canonical} from '../pa/kernels.ts';
import * as k from './kernels.ts';
export interface BuiltinOutput {workingColor?:GpuPixelImageInfo['color'];format?:'rgba16float'|'rgba32float';signal?:AbortSignal}
export interface BuiltinBlur extends BuiltinOutput {radius?:Signal<number>;boundary?:'transparent'|'clamp'}
export interface BuiltinGlow extends BuiltinOutput {radius?:Signal<number>;intensity?:Signal<number>;threshold?:Signal<number>}
export interface BuiltinTransform extends BuiltinOutput {rotation?:Signal<number>;scale?:Signal<number>;opacity?:Signal<number>}
export interface BuiltinMix extends BuiltinOutput {opacity?:Signal<number>;mode?:'screen'|'source-over'|'multiply'|'lighter'}
export interface BuiltinDisplacement extends BuiltinOutput {amount?:Signal<number>;frequency?:Signal<number>;speed?:Signal<number>;seed?:number}
export interface NativeBuiltinFilters {
 blur(image:GpuPixelImage,options?:BuiltinBlur):Promise<GpuPixelImage>;
 brightness(image:GpuPixelImage,options?:BuiltinOutput&{amount?:Signal<number>}):Promise<GpuPixelImage>;
 transform(image:GpuPixelImage,options?:BuiltinTransform):Promise<GpuPixelImage>;
 mix(image:GpuPixelImage,overlay:GpuPixelImage,options?:BuiltinMix):Promise<GpuPixelImage>;
 glow(image:GpuPixelImage,options?:BuiltinGlow):Promise<GpuPixelImage>;
 displacement(image:GpuPixelImage,options?:BuiltinDisplacement):Promise<GpuPixelImage>;
 cinematicGlow(image:GpuPixelImage,options?:BuiltinOutput&{intensity?:Signal<number>;color?:string}):Promise<GpuPixelImage>;
}
export const nativeBuiltinEffectNames=['blur','brightness','transform','mix','glow','displacement','cinematicGlow'] as const satisfies readonly (keyof NativeBuiltinFilters)[];
export const builtinDefaultOptions={blur:{radius:0},brightness:{amount:1},transform:{rotation:0,scale:1,opacity:1},mix:{opacity:1,mode:'screen'},glow:{radius:12,intensity:1.3,threshold:.45},displacement:{amount:7,frequency:9,speed:.8,seed:3},cinematicGlow:{intensity:1.3,color:'#aaffee'}} as const;
function fail(message:string):never{throw new EngineError('E_NATIVE_BUILTIN_PARAMETER',message);}
type Output=Omit<GpuPixelImageInfo,'version'>;
export function createNativeBuiltinEffects(init:Pick<NativeStageInit,'gpu'>){return createNativeRecipeProcessor<NativeBuiltinFilters>(init,(g,c,track,s)=>builtinFilters(g,c,track,s));}
function builtinFilters(g:NativeGpuScope,c:FrameContext|undefined,track:(image:GpuPixelImage)=>GpuPixelImage,signal?:AbortSignal):NativeBuiltinFilters{
 const active=(s?:AbortSignal)=>{if(signal?.aborted||s?.aborted)throw new EngineError('E_RENDER_CANCELLED','Native builtin cancelled before recording');};
 function fields(o:object,extra:readonly string[]){if(!o||typeof o!=='object'||Array.isArray(o)||Object.keys(o).some(n=>!['format','workingColor','signal',...extra].includes(n)))fail('Unknown builtin option');const s=(o as BuiltinOutput).signal;if(s!==undefined&&!(s instanceof AbortSignal))fail('Expected AbortSignal');active(s);}
 function number(v:Signal<number>|undefined,d:number,min:number,max:number,name:string){if(v!==undefined&&typeof v!=='number'&&!c)throw new EngineError('E_NATIVE_BUILTIN_CONTEXT',name+' Signal requires FrameContext');const x=v===undefined?d:typeof v==='number'?v:evaluate(v,c!);if(typeof x!=='number'||!Number.isFinite(x)||x<min||x>max)fail(name+' outside its original range');return x;}
 function output(i:GpuPixelImage,o:BuiltinOutput):Output{const color=o.workingColor??i.info.color,format=o.format??i.info.format;assertColor(color);if(color.transfer!=='linear'||color.reference!=='scene'||!['rgba16float','rgba32float'].includes(format))fail('Explicit scene-linear F16/F32 required');return {...i.info,format,color,alpha:'premultiplied'};}
 async function run(kernel:GpuPixelKernelSource,inputs:readonly GpuPixelImage[],out:Output,p:Float32Array|Uint32Array=new Float32Array(0),s?:AbortSignal,data?:readonly GpuDataBuffer[]){active(s);return track(await g.run(await g.compile(kernel),inputs,{output:out,parameters:p,signal:s??signal,...data?{data}:{}}));}
 async function prepare(i:GpuPixelImage,out:Output,s?:AbortSignal,clearHidden=false){i=await nativeWorkingImage(g,i,out.color,s??signal);return run(clearHidden?canonical:prepareKernel,[i],{...i.info,format:'rgba32float',alpha:'premultiplied'},clearHidden?new Uint32Array(0):Uint32Array.of(1,0),s);}
 const publish=(i:GpuPixelImage,out:Output,s?:AbortSignal)=>run(prepareKernel,[i],out,Uint32Array.of(0,0),s);
 async function gaussian(i:GpuPixelImage,sigma:number,boundary:'transparent'|'clamp',s?:AbortSignal){const radius=Math.ceil(3*sigma),values=sigma===0?[1]:Array.from({length:radius*2+1},(_,n)=>Math.exp(-.5*((n-radius)/sigma)**2)),sum=values.reduce((a,b)=>a+b,0),weights=new Float32Array(2402);weights.set(values.flatMap(v=>split(v/sum)));
  const data=await g.createField({type:'f32',dimensions:[1201,1,1],components:2,semantic:'generic',channels:['weight-high','weight-residual'],metadata:{source:'f64-gaussian-normalized'}});await g.writeBuffer(data,weights);const p=Uint32Array.of(radius,0,Number(boundary==='clamp'),0),h=await run(k.gaussianData,[i],i.info,p,s,[data]);p[1]=1;return run(k.gaussianData,[h],i.info,p,s,[data]);}
 async function blend(front:GpuPixelImage,back:GpuPixelImage,mode:BuiltinMix['mode'],opacity:number,out:Output,s?:AbortSignal){const p=new Uint32Array(6);p[0]=mode==='lighter'?1:mode==='multiply'?2:mode==='screen'?3:0;const values=new Float32Array(p.buffer);values.set(split(opacity),1);values.set(split(1-opacity),4);return run(k.blend,[front,back],out,p,s);}
 const pa=createPaFilters(g,c,track,signal);
 async function displacement(i:GpuPixelImage,o:BuiltinDisplacement={}){fields(o,['amount','frequency','speed','seed']);const out=output(i,o);return pa.displacement(i,{...o,amount:o.amount??builtinDefaultOptions.displacement.amount,workingColor:out.color,format:out.format,alpha:'premultiplied',boundary:'clamp',sampling:'nearest'});}
 async function glow(i:GpuPixelImage,o:BuiltinGlow={}){fields(o,['radius','intensity','threshold']);const radius=number(o.radius,builtinDefaultOptions.glow.radius,0,64,'radius'),intensity=number(o.intensity,builtinDefaultOptions.glow.intensity,0,5,'intensity'),threshold=number(o.threshold,builtinDefaultOptions.glow.threshold,0,1,'threshold'),out=output(i,o),source=await prepare(i,out,o.signal);if(intensity===0||radius===0)return publish(source,out,o.signal);
  const m=gamutMatrix(out.color,{...linear709,referenceWhiteNits:out.color.referenceWhiteNits}),weights=[0,1,2].map(col=>.2126*m[0][col]+.7152*m[1][col]+.0722*m[2][col]),p=new Float32Array(17);p.set(split(threshold),2);p.set(weights.flatMap(split),4);const bright=await run(k.threshold,[source],source.info,p,o.signal),soft=await gaussian(bright,radius,'transparent',o.signal);let result=source;for(let amount=intensity;amount>0;amount-=1)result=await blend(soft,result,'screen',Math.min(1,amount),source.info,o.signal);return publish(result,out,o.signal);}
 return {
  async blur(i,o={}){fields(o,['radius','boundary']);const radius=number(o.radius,builtinDefaultOptions.blur.radius,0,200,'radius'),boundary=o.boundary??'transparent';if(!['clamp','transparent'].includes(boundary))fail('Invalid blur boundary');const out=output(i,o),source=await prepare(i,out,o.signal,true);return publish(await gaussian(source,radius,boundary,o.signal),out,o.signal);},
  async brightness(i,o={}){fields(o,['amount']);const amount=number(o.amount,builtinDefaultOptions.brightness.amount,0,10,'amount'),out=output(i,o),source=await prepare(i,out,o.signal),p=new Float32Array(17);p.set(split(amount),2);return run(k.brightness,[source],out,p,o.signal);},
  async transform(i,o={}){fields(o,['rotation','scale','opacity']);const rotation=number(o.rotation,builtinDefaultOptions.transform.rotation,-3600,3600,'rotation'),scale=number(o.scale,builtinDefaultOptions.transform.scale,.01,5,'scale'),opacity=number(o.opacity,builtinDefaultOptions.transform.opacity,0,1,'opacity'),out=output(i,o),a=invert(matrix({id:'transform',start:0,end:1,originX:i.info.width/2,originY:i.info.height/2,rotation,scale}));if(!a)fail('Singular transform');const p=new Float32Array(17);p.set([a[0],a[1],a[2],a[3],a[4]-.5,a[5]-.5].flatMap(split),2);p.set(split(opacity),15);const source=await prepare(i,out,o.signal);return run(k.transform,[source],out,p,o.signal);},
  async mix(i,overlay,o={}){fields(o,['mode','opacity']);const mode=o.mode??builtinDefaultOptions.mix.mode,opacity=number(o.opacity,builtinDefaultOptions.transform.opacity,0,1,'opacity');if(!['screen','source-over','multiply','lighter'].includes(mode))fail('Unknown original mix mode');if(i.info.width!==overlay.info.width||i.info.height!==overlay.info.height)fail('Mix requires equal physical dimensions');const out=output(i,o),back=await prepare(i,out,o.signal),front=await prepare(overlay,out,o.signal);return blend(front,back,mode,opacity,out,o.signal);},
  glow,displacement,
  async cinematicGlow(i,o={}){fields(o,['intensity','color']);if(o.color!==undefined&&typeof o.color!=='string')fail('Original preset color must be a string');const intensity=number(o.intensity,builtinDefaultOptions.glow.intensity,0,5,'intensity'),common={format:o.format,workingColor:o.workingColor,signal:o.signal};return glow(await displacement(i,{...common,amount:3}),{...common,intensity,radius:14});},
 };
}
