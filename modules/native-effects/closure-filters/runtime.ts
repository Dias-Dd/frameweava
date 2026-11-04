import type {FrameContext} from '../../../src/core/types.ts';
import type {NativeGpuScope} from '../../native-gpu/authoring.ts';
import type {GpuPixelImage} from '../../gpu-effects/pixel-types.ts';
import type {GpuDataBuffer,GpuComputeKernelSource} from '../../gpu-effects/compute-types.ts';
import {gamutMatrix} from '../../../src/media/color.ts';
import {linear709} from '../../../src/media/surface.ts';
import {nativePixelInfo} from '../../native-gpu/image-info.ts';
import {nativeWorkingImage} from '../color.ts';
import {parameters,split,fail} from './control.ts';
import {filterKernel} from './kernels.ts';
import {momentsRows,momentsFinish,calibration} from './compute.ts';
import type {ClosureOutput} from './types.ts';
export function closureRuntime(g:NativeGpuScope,context?:FrameContext,outer?:AbortSignal){const limits=g.capabilities().limits;let dummy:GpuDataBuffer|undefined;
 function storage(n:number){if(!Number.isSafeInteger(n)||n<1||n>0xffffffff||n*4>Math.min(limits.maxBufferSize,limits.maxStorageBufferBindingSize))fail('filters','storage','typed storage within actual device limits');return n;}
 const buffer=(n:number,data?:Float32Array)=>g.createBuffer({type:'f32',length:storage(n)},data);
 const words=(values:readonly number[]=[],flags:readonly number[]=[],image?:GpuPixelImage)=>{const p=new Uint32Array(128),f=new Float32Array(p.buffer);p.set(flags);f.set(values.flatMap(split),8);const m=gamutMatrix(image?.info.color??linear709,linear709);f.set([0,1,2].map(j=>.2126390058715104*m[0][j]+.715168678767756*m[1][j]+.0721923153607337*m[2][j]).flatMap(split),88);return p;};
 async function working(image:GpuPixelImage,o:ClosureOutput){parameters('filters',context,outer).active(o.signal);if(!image||!image.info)fail('filters','image','an owner-local admitted GPU image');nativePixelInfo({...image.info,color:o.workingColor??image.info.color},g.capabilities());return nativeWorkingImage(g,image,o.workingColor??image.info.color,o.signal??outer);}
 const view=(image:GpuPixelImage,o:ClosureOutput)=>{if(!g.imageToBuffer)fail('filters','gpu','Native readonly image-data v1');return g.imageToBuffer(image,{version:1,signal:o.signal??outer});};
 async function run(image:GpuPixelImage,mode:number,o:ClosureOutput,values:readonly number[]=[],flags:readonly number[]=[],guide=image,data?:GpuDataBuffer,intermediate=false){parameters('filters',context,outer).active(o.signal);if(guide.info.width!==image.info.width||guide.info.height!==image.info.height)fail('filters','reference.dimensions','matching image dimensions');dummy??=await buffer(1,Float32Array.of(0));const p=words(values,[mode,...flags],image);new Float32Array(p.buffer).set(split(intermediate?1:parameters('filters',context,outer).scalar(o.amount,1,'amount',0,1)),68);return g.run(await g.compile(filterKernel),[image,guide],{output:{...image.info,format:intermediate?'rgba32float':o.format??image.info.format,alpha:'premultiplied'},parameters:p,data:[data??dummy],signal:o.signal??outer});}
 const alpha=(i:GpuPixelImage)=>i.info.alpha==='straight'?1:i.info.alpha==='opaque'?2:0;
 const dispatch=async(k:GpuComputeKernelSource,b:readonly GpuDataBuffer[],p:Uint32Array,workItems:readonly[number,number,number],o:ClosureOutput)=>{parameters('filters',context,outer).active(o.signal);await g.dispatch(await g.compileCompute(k),b,{parameters:p,workItems,signal:o.signal??outer});};
 async function moments(a:GpuPixelImage,b:GpuPixelImage,o:ClosureOutput){const {width:w,height:h}=a.info,owned:GpuDataBuffer[]=[];try{const rows:GpuDataBuffer[]=[];for(const image of [a,b]){const v=await view(image,o),row=await buffer(h*14);owned.push(v,row);rows.push(row);await dispatch(momentsRows,[v,row],words([],[w,h,alpha(image)],a),[h,1,1],o);}const output=await buffer(24);try{await dispatch(momentsFinish,[...rows,output],words([],[w,h],a),[1,1,1],o);return output;}catch(e){await g.releaseBuffer(output);throw e;}}finally{for(const x of owned.reverse())await g.releaseBuffer(x);}}
 async function calibrate(a:GpuPixelImage,b:GpuPixelImage,points:readonly number[],epsilon:number,o:ClosureOutput){const av=await view(a,o),bv=await view(b,o),out=await buffer(12);try{await dispatch(calibration,[av,bv,out],words([...points,epsilon],[a.info.width,a.info.height,alpha(a),alpha(b)],a),[1,1,1],o);return out;}catch(e){await g.releaseBuffer(out);throw e;}finally{await g.releaseBuffer(av);await g.releaseBuffer(bv);}}
 return {storage,buffer,words,working,view,run,alpha,dispatch,moments,calibrate};
}
