import type {FrameContext} from '../../../src/core/types.ts';
import {gamutMatrix} from '../../../src/media/color.ts';
import {linear709,type ProfessionalSurface} from '../../../src/media/surface.ts';
import {createMatteFilters,type ProfessionalMatteFilters} from './matte.ts';
import {createCreativeFilters} from './creative/filters.ts';
import type {CreativeFilters} from './creative/types.ts';
import {createBlendFilters} from './blends/filters.ts';
import type {BlendFilters} from './blends/types.ts';
import {createFoundationFilters} from './foundations/filters.ts';
import type {FoundationFilters} from './foundations/types.ts';
import type {GpuPixelScope,GpuPixelImage,GpuPixelKernelSourceV1} from '../../gpu-effects/pixel-types.ts';
import {copyPM,channelMixKernel,levelsKernel,curvesKernel,lumaKeyKernel,chromaKeyKernel,despillKernel,blurPrepare,gaussianAxis,unsharpKernel} from './kernels.ts';
import {fields,number,triple,flag,curveWords,fail,type OutputOptions,type LevelsOptions,type ChannelMixOptions,type CurvesOptions,type UnsharpMaskOptions,type LumaKeyOptions,type ChromaKeyOptions,type DespillOptions} from './parameters.ts';
export interface ProfessionalFilters extends ProfessionalMatteFilters,CreativeFilters,BlendFilters,FoundationFilters {
 importImage(surface:ProfessionalSurface):Promise<GpuPixelImage>;
 channelMix(input:GpuPixelImage,options?:ChannelMixOptions):Promise<GpuPixelImage>;
 levels(input:GpuPixelImage,options?:LevelsOptions):Promise<GpuPixelImage>;
 curves(input:GpuPixelImage,options?:CurvesOptions):Promise<GpuPixelImage>;
 unsharpMask(input:GpuPixelImage,options?:UnsharpMaskOptions):Promise<GpuPixelImage>;
 lumaKey(input:GpuPixelImage,options?:LumaKeyOptions):Promise<GpuPixelImage>;
 chromaKey(input:GpuPixelImage,options?:ChromaKeyOptions):Promise<GpuPixelImage>;
 despill(input:GpuPixelImage,options?:DespillOptions):Promise<GpuPixelImage>;
}
/** Thin adapters over the ONE public PixelScope. Handles keep the existing
 * ownership, gate, colour, publication and cancellation contracts. */
export function createProfessionalFilters(scope:GpuPixelScope,context?:FrameContext,track:(image:GpuPixelImage)=>GpuPixelImage=v=>v,signal?:AbortSignal):ProfessionalFilters{
 async function run(source:GpuPixelKernelSourceV1,inputs:readonly GpuPixelImage[],p:Float32Array|Uint32Array,options:OutputOptions={}){return track(await scope.run(await scope.compile(source),inputs,{parameters:p,output:{format:options.format??inputs[0].info.format,alpha:'premultiplied'},signal:options.signal??signal}));}
 const weights=(image:GpuPixelImage)=>{const m=gamutMatrix(image.info.color,linear709);return [0,1,2].map(c=>Math.fround(.2126*m[0][c]+.7152*m[1][c]+.0722*m[2][c]));};
 return {
  ...createMatteFilters(scope,context,track,signal),
  ...createCreativeFilters(scope,context,track,signal),
  ...createBlendFilters(scope,context,track,signal),
  ...createFoundationFilters(scope,context,track,signal),
  importImage:async surface=>track(await scope.upload(surface,{signal})),
  async channelMix(input,o={}){fields(o,['matrix','offset'],'channelMix');if(o.matrix!==undefined&&(!Array.isArray(o.matrix)||o.matrix.length!==3))fail('channelMix.matrix requires three rows');const matrix=[0,1,2].flatMap(i=>triple(o.matrix?.[i],i===0?[1,0,0]:i===1?[0,1,0]:[0,0,1],'matrix['+i+']',context));return run(channelMixKernel,[input],Float32Array.from([...matrix,...triple(o.offset,[0,0,0],'offset',context)]),o);},
  async levels(input,o={}){fields(o,['inputBlack','inputWhite','outputBlack','outputWhite','gamma','clampInput'],'levels');const b=triple(o.inputBlack,[0,0,0],'inputBlack',context),w=triple(o.inputWhite,[1,1,1],'inputWhite',context),g=triple(o.gamma,[1,1,1],'gamma',context);if(w.some((v,i)=>v<=b[i])||g.some(v=>v<=0))fail('Levels require positive gamma and inputWhite>inputBlack after F32 quantization');const p=Float32Array.from([...b,...w,...g,...triple(o.outputBlack,[0,0,0],'outputBlack',context),...triple(o.outputWhite,[1,1,1],'outputWhite',context),0]);new Uint32Array(p.buffer)[15]=Number(flag(o.clampInput,false,'clampInput'));return run(levelsKernel,[input],p,o);},
  async curves(input,o={}){fields(o,['red','green','blue'],'curves');const p=new Float32Array(296);let cursor=4;for(const [i,knots] of [o.red,o.green,o.blue].entries()){const values=curveWords(knots);p[i]=cursor;p.set(values,cursor);cursor+=values.length;}return run(curvesKernel,[input],p,o);},
  async lumaKey(input,o={}){fields(o,['low','high','invert'],'lumaKey');const low=number(o.low,.05,'low',context),high=number(o.high,.2,'high',context);if(high<=low)fail('lumaKey.high must exceed low after F32 quantization');const p=Float32Array.from([low,high,...weights(input),0]);new Uint32Array(p.buffer)[5]=Number(flag(o.invert,false,'invert'));return run(lumaKeyKernel,[input],p,o);},
  async chromaKey(input,o={}){fields(o,['color','inner','outer','invert'],'chromaKey');const inner=number(o.inner,.05,'inner',context,0),outer=number(o.outer,.2,'outer',context,0);if(outer<=inner)fail('chromaKey.outer must exceed inner after F32 quantization');const p=Float32Array.from([...triple(o.color,[0,1,0],'color',context),inner,outer,...weights(input),0]);new Uint32Array(p.buffer)[8]=Number(flag(o.invert,false,'invert'));return run(chromaKeyKernel,[input],p,o);},
  async despill(input,o={}){fields(o,['channel','amount','limit'],'despill');const channels=['red','green','blue'],channel=channels.indexOf(o.channel??'green');if(channel<0||o.limit!==undefined&&!['max','average'].includes(o.limit))fail('Unknown despill channel/limit');const p=new Uint32Array(3);p[0]=channel;new Float32Array(p.buffer)[1]=number(o.amount,1,'amount',context,0,1);p[2]=Number(o.limit==='average');return run(despillKernel,[input],p,o);},
  async unsharpMask(input,o={}){
   fields(o,['radius','amount','boundary'],'unsharpMask');const radius=number(o.radius,2,'radius',context,0,64),amount=number(o.amount,1,'amount',context,0);if(o.boundary!==undefined&&!['clamp','transparent'].includes(o.boundary))fail('Unknown unsharp boundary');if(amount===0)return run(copyPM,[input],new Float32Array(0),o);
   const r=Math.ceil(3*radius),w=radius===0?[1]:Array.from({length:r*2+1},(_,i)=>Math.exp(-.5*((i-r)/radius)**2)),sum=w.reduce((a,b)=>a+b,0),p=new Uint32Array(774),f=new Float32Array(p.buffer);p[0]=r;p[2]=Number((o.boundary??'clamp')==='clamp');for(let i=0;i<w.length;i++){const value=w[i]/sum,hi=Math.fround(value);f[4+2*i]=hi;f[5+2*i]=value-hi;}
   const temps:GpuPixelImage[]=[];const temp=async(k:GpuPixelKernelSourceV1,images:readonly GpuPixelImage[],parameters:Float32Array|Uint32Array)=>{const v=await scope.run(await scope.compile(k),images,{parameters,output:{format:'rgba32float',alpha:'premultiplied'},signal:o.signal??signal});temps.push(v);return v;};
   try{const prepared=await temp(blurPrepare,[input],new Float32Array(0)),h=await temp(gaussianAxis,[prepared],p);p[1]=1;const b=await temp(gaussianAxis,[h],p);return await run(unsharpKernel,[input,b],Float32Array.of(amount),o);}finally{for(const v of temps.reverse())await scope.release(v);}
  },
 };
}
