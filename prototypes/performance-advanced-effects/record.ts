import type {GpuPixelScope,GpuPixelKernel,GpuPixelKernelSource,GpuPixelImage,GpuPixelRunOptions,GpuPixelImageInfo} from '../../modules/gpu-effects/pixel-types.ts';
import {validatePixelKernel,nativePixelShader,pixelInfo} from '../../modules/gpu-effects/pixel-shader.ts';
import type {NativeProgram} from '../../modules/native-gpu/client.ts';
import {randomBytes} from 'node:crypto';

/** Benchmark-only compiler adapter, NOT an emulated GPU or production host.
 * Records the same real effect API's WGSL/uniform tape; Rust executes it. */
export class RecipeRecorder {
 private tokens=new WeakMap<object,{index:number;source:GpuPixelKernelSource}>();
 private images=new WeakMap<object,number>();private cache=new Map<string,GpuPixelKernel>();
 private kernels:NativeProgram['kernels']=[];
 info:GpuPixelImageInfo[]=[];passes:NativeProgram['passes']=[];parameters:number[][]=[];
 readonly api={
  compile:async(source:GpuPixelKernelSource)=>{
   const s=validatePixelKernel(source);if(s.abiVersion!==1)throw Error('Native checkpoint cannot compile ABI2');
   const key=s.id+'@'+s.version,previous=this.cache.get(key);if(previous)return previous;
   const token=Object.freeze({}) as GpuPixelKernel,index=this.kernels.push({code:nativePixelShader(s),inputCount:s.inputCount,parameterWords:s.parameterWords,headerWords:32})-1;
   this.tokens.set(token,{source:s,index});this.cache.set(key,token);return token;
  },
  run:async(token:GpuPixelKernel,inputs:readonly GpuPixelImage[],options:GpuPixelRunOptions={})=>{
   const k=this.tokens.get(token);if(!k)throw Error('Foreign recorded kernel');
   if(options.data?.length)throw Error('Native ABI2/data recording is explicitly unsupported');
   const info=pixelInfo({...inputs[0]?.info,...options.output} as GpuPixelImageInfo),index=this.info.push(info)-1;
   const inputIds=inputs.map(input=>{const id=this.images.get(input);if(id===undefined)throw Error('Foreign recorded image');return id;});
   const alpha=(v:GpuPixelImageInfo)=>v.alpha==='premultiplied'?0:v.alpha==='straight'?1:2;
   const header=new Array<number>(32).fill(0);header.splice(0,4,info.width,info.height,Number(info.format==='rgba16float'),alpha(info));
   inputIds.forEach((i,j)=>header.splice((j+1)*4,4,this.info[i].width,this.info[i].height,alpha(this.info[i]),0));
   const p=options.parameters??new Uint32Array(k.source.parameterWords);
   if(p.length!==k.source.parameterWords)throw Error('Parameter layout changed');
   this.parameters.push(Array.from(new Uint32Array(p.buffer,p.byteOffset,p.length)));
   this.passes.push({kernel:k.index,inputs:inputIds,output:index,header});
   const image=Object.freeze({info,toJSON:()=>{throw Error('Recorded resource is not a Surface');}}) as GpuPixelImage;
   this.images.set(image,index);return image;
  },
  release:async(image:GpuPixelImage)=>{this.images.delete(image);},
  stats:()=>({pendingPasses:this.passes.length}),
  capabilities:()=>({maxPendingPasses:128}),
 } as unknown as GpuPixelScope;
 reset(){this.images=new WeakMap();this.info=[];this.passes=[];this.parameters=[];}
 program(slots=2):NativeProgram{
  return {version:1,session:randomBytes(32).toString('hex'),slots,maxBytes:4*1024**3,
   images:this.info.map(({version:_v,...metadata})=>metadata),kernels:this.kernels,passes:this.passes,display:null};
 }
}
