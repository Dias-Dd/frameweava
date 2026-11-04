import type {FrameContext} from '../../../src/core/types.ts';
import {gamutMatrix} from '../../../src/media/color.ts';
import {linear709} from '../../../src/media/surface.ts';
import type {NativeGpuScope} from '../../native-gpu/authoring.ts';
import type {GpuPixelImage} from '../../gpu-effects/pixel-types.ts';
import type {GpuDataBuffer} from '../../gpu-effects/compute-types.ts';
import {nativePixelInfo} from '../../native-gpu/image-info.ts';
import {nativeWorkingImage} from '../color.ts';
import {keyingRuntime} from '../keying/runtime.ts';
import {parameters,split,fail} from './control.ts';
import type {StyleOutput} from './types.ts';
import {stylizeKernel,mosaicReduce} from './kernels.ts';
export function styleRuntime(g:NativeGpuScope,context?:FrameContext,outer?:AbortSignal){const gaussian=keyingRuntime(g,context,outer),caps=g.capabilities().limits,cache=new WeakMap<GpuPixelImage,Map<number,GpuDataBuffer>>();let dummy:GpuDataBuffer|undefined;
 function storage(n:number){if(!Number.isSafeInteger(n)||n<1||n>0xffffffff||n*4>Math.min(caps.maxStorageBufferBindingSize,caps.maxBufferSize))fail('stylize','storage','typed data fitting actual device limits');return n;}
 const buffer=(values:Float32Array)=>g.createBuffer({type:'f32',length:storage(values.length)},values);
 function params(image:GpuPixelImage,values:readonly number[]=[],flags:readonly number[]=[],ink:readonly number[]=[0,0,0],paper:readonly number[]=[1,1,1],amount=1){const p=new Uint32Array(128),f=new Float32Array(p.buffer);p.set(flags);f.set(values.flatMap(split),8);f.set(ink.flatMap(split),48);f.set(paper.flatMap(split),54);f.set(split(amount),68);const m=gamutMatrix(image.info.color,linear709),luma=[0,1,2].map(c=>.2126390058715104*m[0][c]+.715168678767756*m[1][c]+.0721923153607337*m[2][c]);f.set(luma.flatMap(split),88);return p;}
 async function working(image:GpuPixelImage,o:StyleOutput){if(!image||typeof image!=='object'||!image.info)fail('stylize','image','a local admitted GPU image');nativePixelInfo({...image.info,color:o.workingColor??image.info.color},g.capabilities());return nativeWorkingImage(g,image,o.workingColor??image.info.color,o.signal??outer);}
 async function run(image:GpuPixelImage,mode:number,o:StyleOutput,values:readonly number[]=[],flags:readonly number[]=[],guide=image,data?:GpuDataBuffer,ink?:readonly number[],paper?:readonly number[]){const p=parameters('stylize',context,outer);p.active(o.signal);if(guide.info.width!==image.info.width||guide.info.height!==image.info.height)fail('stylize','guide.dimensions','matching image dimensions');dummy??=await buffer(Float32Array.of(0));return g.run(await g.compile(stylizeKernel),[image,guide],{output:{...image.info,format:o.format??image.info.format,alpha:'premultiplied'},parameters:params(image,values,[mode,...flags],ink,paper,p.scalar(o.amount,1,'amount',0,1)),data:[data??dummy],signal:o.signal??outer});}
 async function mosaic(image:GpuPixelImage,block:number,o:StyleOutput){let map=cache.get(image);const hit=map?.get(block);if(hit)return hit;const {width,height}=image.info,cols=Math.ceil(width/block),rows=Math.ceil(height/block),view=await g.imageToBuffer!(image,{version:1,signal:o.signal??outer}),out=await g.createBuffer({type:'f32',length:storage(cols*rows*12)});try{await g.dispatch(await g.compileCompute(mosaicReduce),[view,out],{workItems:[cols,rows,1],parameters:params(image,[],[width,height,block,cols,image.info.alpha==='straight'?1:image.info.alpha==='opaque'?2:0]),signal:o.signal??outer});if(!map){map=new Map();cache.set(image,map);}map.set(block,out);return out;}catch(e){await g.releaseBuffer(out);throw e;}finally{await g.releaseBuffer(view);}}
 return {params,storage,buffer,working,run,mosaic,blur:gaussian.blur};
}
