import type {FrameContext} from '../../../src/core/types.ts';
import {gamutMatrix} from '../../../src/media/color.ts';
import {linear709} from '../../../src/media/surface.ts';
import type {NativeGpuScope} from '../../native-gpu/authoring.ts';
import type {GpuPixelImage,GpuPixelKernelSource} from '../../gpu-effects/pixel-types.ts';
import type {GpuDataBuffer} from '../../gpu-effects/compute-types.ts';
import {nativePixelInfo} from '../../native-gpu/image-info.ts';
import {nativeWorkingImage} from '../color.ts';
import {keyingRuntime} from '../keying/runtime.ts';
import {parameters,integer,split,fail} from './control.ts';
import type {OpticalOutput} from './types.ts';
import * as K from './kernels.ts';
export function opticalRuntime(g:NativeGpuScope,context?:FrameContext,outer?:AbortSignal){
 const limits=g.capabilities().limits,gaussian=keyingRuntime(g,context,outer);
 function storage(words:number){if(!Number.isSafeInteger(words)||words<1||words>0xffffffff||words*4>Math.min(limits.maxBufferSize,limits.maxStorageBufferBindingSize))fail('optics','storage','typed storage fitting actual device limits and uint32 addressing');return words;}
 const buffer=(values:Float32Array)=>g.createBuffer({type:'f32',length:storage(values.length)},values);
 const table=(values:readonly number[])=>buffer(Float32Array.from(values.flatMap(split)));
 const p=(name:string,o:OpticalOutput,extra:readonly string[])=>{const c=parameters(name,context,outer);c.fields(o,extra);return c;};
 function words(image:GpuPixelImage,values:readonly number[]=[],flags:readonly number[]=[],amount=1){const words=new Uint32Array(128),f=new Float32Array(words.buffer);flags.forEach((v,i)=>words[i]=v);f.set(values.flatMap(split),8);f.set(split(amount),68);const m=gamutMatrix(image.info.color,linear709),luma=[0,1,2].map(j=>.2126390058715104*m[0][j]+.715168678767756*m[1][j]+.0721923153607337*m[2][j]);f.set(luma.flatMap(split),88);return words;}
 async function run(image:GpuPixelImage,k:GpuPixelKernelSource,o:OpticalOutput,values:readonly number[]=[],flags:readonly number[]=[],guide=image,data?:GpuDataBuffer,size?:readonly [number,number],intermediate=false){const c=parameters(k.id,context,outer);c.active(o.signal);if(k.abiVersion===2&&k.dataInputs.length&&!data)fail(k.id,'data','the required optical control buffer');return g.run(await g.compile(k),[image,guide],{output:{...image.info,width:size?.[0]??image.info.width,height:size?.[1]??image.info.height,format:intermediate?'rgba32float':o.format??image.info.format,alpha:'premultiplied'},parameters:words(image,values,flags,intermediate?1:c.scalar(o.amount,1,'amount',0,1)),data:data?[data]:[],signal:o.signal??outer});}
 async function working(image:GpuPixelImage,o:OpticalOutput){if(!image||typeof image!=='object'||!image.info)fail('optics','image','an admitted owner-local GPU image');nativePixelInfo({...image.info,color:o.workingColor??image.info.color},g.capabilities());const i=await nativeWorkingImage(g,image,o.workingColor??image.info.color,o.signal??outer);return run(i,K.copy,o,[],[],i,undefined,undefined,true);}
 const intermediate=(o:OpticalOutput)=>({...o,format:'rgba32float' as const,amount:1});
 const bright=(image:GpuPixelImage,o:OpticalOutput,threshold:number,knee:number)=>run(image,K.highlight,intermediate(o),[threshold,knee],[],image,undefined,undefined,true);
 const add=(image:GpuPixelImage,light:GpuPixelImage,o:OpticalOutput,intensity:number)=>run(image,K.add,o,[0,0,intensity],[],light);
 async function convolve(image:GpuPixelImage,o:OpticalOutput,values:Float32Array,count:number,final=false){storage(values.length);const data=await buffer(values);try{return await run(image,K.convolve,o,[],[count],image,data,undefined,!final);}finally{await g.releaseBuffer(data);}}
 async function directional(image:GpuPixelImage,o:OpticalOutput,length:number,samples:number,decay:number,angles:readonly number[]){integer(samples,'streakGlare','samples',2);storage(samples*6+angles.length*4);const raw:number[]=[],weights=Array.from({length:samples},(_,j)=>Math.exp(-decay*Math.abs(2*j/(samples-1)-1))),total=weights.reduce((a,b)=>a+b,0);for(let j=0;j<samples;j++)raw.push(length*(2*j/(samples-1)-1),0,weights[j]/total);const data=await table([...raw,...angles.flatMap(a=>[Math.cos(a),Math.sin(a)])]);try{return await run(image,K.streak,intermediate(o),[],[samples,angles.length],image,data,undefined,true);}finally{await g.releaseBuffer(data);}}
 async function mean(image:GpuPixelImage,o:OpticalOutput){storage(image.info.width*image.info.height*4);const view=await g.imageToBuffer!(image,{version:1,signal:o.signal??outer}),rows=await g.createBuffer({type:'f32',length:storage(image.info.height*4)}),out=await g.createBuffer({type:'f32',length:4});try{const kernel=await g.compileCompute(K.mean),params=words(image,[],[image.info.width,image.info.height,0]);await g.dispatch(kernel,[view,rows],{workItems:[image.info.height,1,1],parameters:params,signal:o.signal??outer});params[2]=1;await g.dispatch(kernel,[rows,out],{workItems:[1,1,1],parameters:params,signal:o.signal??outer});return out;}catch(e){await g.releaseBuffer(out);throw e;}finally{await g.releaseBuffer(view);await g.releaseBuffer(rows);}}
 return {p,storage,buffer,table,words,run,working,bright,add,convolve,directional,mean,intermediate,blur:gaussian.blur};
}
