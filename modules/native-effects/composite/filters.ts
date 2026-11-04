import type {NativeStageInit} from '../../native-gpu/authoring.ts';
import type {GpuPixelImage} from '../../gpu-effects/pixel-types.ts';
import {nativePixelInfo} from '../../native-gpu/image-info.ts';
import {gamutMatrix} from '../../../src/media/color.ts';
import {linear709} from '../../../src/media/surface.ts';
import {createNativeRecipeProcessor} from '../images.ts';
import {nativeWorkingImage} from '../color.ts';
import {rasterFilters,type NativeRasterFilters} from '../raster/filters.ts';
import {parameters,integer,split,fail} from './control.ts';
import {compositeKernel} from './kernels.ts';
import type * as T from './types.ts';
export {nativeCompositeNames} from './types.ts';
export type NativeCompositeRecipeFilters=T.NativeCompositeFilters&Pick<NativeRasterFilters,'over'>;
export function createNativeCompositeEffects(init:Pick<NativeStageInit,'gpu'>){return createNativeRecipeProcessor<NativeCompositeRecipeFilters>(init,(g,context,track,signal)=>{
 async function blend(name:string,mode:number,source:GpuPixelImage,destination:GpuPixelImage,o:T.RationalOptions&Partial<T.DissolveOptions>){const extra=mode===1||mode===2||mode===3||mode===11?['epsilon']:mode===20?['seed','animated']:[],p=parameters(name,context,signal);p.fields(o,extra);if(!source||!source.info||!destination||!destination.info)fail(name,'images','two local admitted GPU images');if(source.info.width!==destination.info.width||source.info.height!==destination.info.height)fail(name,'destination.dimensions','matching image dimensions');const color=o.workingColor??source.info.color,info=nativePixelInfo({...source.info,format:o.format??source.info.format,color,alpha:'premultiplied'},g.capabilities()),opacity=p.scalar(o.opacity,1,'opacity',0,1),epsilon=extra.includes('epsilon')?p.scalar(o.epsilon,2**-10,'epsilon',2**-20,1):2**-10,seed=mode===20?integer(o.seed??71,name,'seed'):0;if(o.animated!==undefined&&typeof o.animated!=='boolean')fail(name,'animated','boolean');if(o.animated&&!context)fail(name,'animated','an explicit FrameContext');const frame=o.animated?integer(Math.floor(context!.globalFrame),name,'frame'):0,words=new Uint32Array(128),f=new Float32Array(words.buffer);words.set([mode,seed,frame]);f.set([opacity,epsilon].flatMap(split),8);const m=gamutMatrix(color,linear709),luma=[0,1,2].map(j=>.2126390058715104*m[0][j]+.715168678767756*m[1][j]+.0721923153607337*m[2][j]);f.set(luma.flatMap(split),88);const s=await nativeWorkingImage(g,source,color,o.signal??signal),d=await nativeWorkingImage(g,destination,color,o.signal??signal);return g.run(await g.compile(compositeKernel),[s,d],{output:info,parameters:words,signal:o.signal??signal});}
 const f:T.NativeCompositeFilters={
  async softLight(s,d,o={}){return blend('softLight',0,s,d,o);},
  async colorDodge(s,d,o={}){return blend('colorDodge',1,s,d,o);},
  async colorBurn(s,d,o={}){return blend('colorBurn',2,s,d,o);},
  async vividLight(s,d,o={}){return blend('vividLight',3,s,d,o);},
  async hardMix(s,d,o={}){return blend('hardMix',4,s,d,o);},
  async hueBlend(s,d,o={}){return blend('hueBlend',5,s,d,o);},
  async saturationBlend(s,d,o={}){return blend('saturationBlend',6,s,d,o);},
  async colorBlend(s,d,o={}){return blend('colorBlend',7,s,d,o);},
  async luminosityBlend(s,d,o={}){return blend('luminosityBlend',8,s,d,o);},
  async lighterColor(s,d,o={}){return blend('lighterColor',9,s,d,o);},
  async darkerColor(s,d,o={}){return blend('darkerColor',10,s,d,o);},
  async divideBlend(s,d,o={}){return blend('divideBlend',11,s,d,o);},
  async negationBlend(s,d,o={}){return blend('negationBlend',12,s,d,o);},
  async phoenixBlend(s,d,o={}){return blend('phoenixBlend',13,s,d,o);},
  async destinationOver(s,d,o={}){return blend('destinationOver',14,s,d,o);},
  async sourceOut(s,d,o={}){return blend('sourceOut',15,s,d,o);},
  async sourceAtop(s,d,o={}){return blend('sourceAtop',16,s,d,o);},
  async destinationAtop(s,d,o={}){return blend('destinationAtop',17,s,d,o);},
  async xorComposite(s,d,o={}){return blend('xorComposite',18,s,d,o);},
  async saturateComposite(s,d,o={}){return blend('saturateComposite',19,s,d,o);},
  async dissolve(s,d,o={}){return blend('dissolve',20,s,d,o);},
  async linearDodgeBlend(s,d,o={}){return blend('linearDodgeBlend',21,s,d,o);},
 };
 return {...f,over:rasterFilters(g,context,track,signal).over};
});}
