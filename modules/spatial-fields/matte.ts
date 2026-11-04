import {linear709} from '../../src/media/surface.ts';
import type {GpuPixelImage,GpuPixelKernel,GpuPixelScope} from '../gpu-effects/index.ts';
import {fail,layout,object,prepare,putCamera,scalar} from './parameters.ts';
import type {DepthMatteOptions,FrameContext,SpatialField} from './types.ts';

let kernels:WeakMap<GpuPixelScope,Promise<GpuPixelKernel>>|undefined;
const code=/* wgsl */`
fn pixel(p:vec2u)->vec4f {
  let i=p.y*outputSize().x+p.x;
  let valid=data1(i);
  // Missing samples never turn into a far/background matte.
  if(valid==0.0){return vec4f(0.0);}
  let z=data0(i);
  if(valid!=1.0 || (bitcast<u32>(z)&0x7f800000u)==0x7f800000u || z<=0.0 || abs(z)>1e30){
    // Deliberately invalid Alpha: existing per-publication validation rejects
    // the candidate at complete/readback, without publishing stale/black data.
    return vec4f(0.0,0.0,0.0,2.0);
  }
  let lo=paramF32(0u);let hi=paramF32(1u);let feather=paramF32(2u);
  var coverage=select(0.0,1.0,z>=lo && z<=hi);
  if(feather>0.0){
    coverage=smoothstep(lo,lo+feather,z)*(1.0-smoothstep(hi-feather,hi,z));
  }
  // White, scene-linear premultiplied coverage; depth remains non-color data.
  return vec4f(coverage);
}`;

/** Same-Stage positive axial depth -> caller-owned white PM coverage image.
 * Inputs are borrowed. Await scope.complete/readback before publication.
 * No resampling, color-depth disguise, CPU fallback or implicit time advance. */
export async function depthRangeMatte(gpu:GpuPixelScope,depth:SpatialField,ctx:FrameContext,options:DepthMatteOptions):Promise<GpuPixelImage>{
  object(options,'options',['camera','near','far','softness','format','signal','maxWork']);
  const shape=layout(depth,['axial-depth'],ctx);
  const words=prepare(options,['camera','near','far','softness','format'],ctx,shape.n,64);
  const cam=putCamera(words,options,shape,depth),d=depth.data.info,v=depth.validity.info;
  if(d.version!==1 || v.version!==1 || v.kind!=='data' || d.length!==shape.n || v.length!==shape.n || d.byteLength!==shape.n*4 || v.byteLength!==shape.n*4 || JSON.stringify(d.channels)!=='["depth"]' || JSON.stringify(v.channels)!=='["valid"]' || (v.metadata as any)?.profile!=='frameweave.spatial-validity/1'){
    fail('FIELD','Depth Matte needs the declared depth1 + validity1 profiles and channels');
  }
  const near=Math.fround(scalar(options.near,cam.near,ctx,'near'));
  const far=Math.fround(scalar(options.far,cam.far,ctx,'far'));
  const softness=Math.fround(scalar(options.softness,0,ctx,'softness'));
  if(!(far>near))fail('PARAMETER','Depth Matte requires near < far after f32 conversion');
  if(softness*2>far-near || softness>0 && (Math.fround(near+softness)<=near || Math.fround(far-softness)>=far)){
    fail('PARAMETER','softness must fit inside half the depth interval and remain representable in f32');
  }
  const format=options.format??'rgba32float';
  if(format!=='rgba16float'&&format!=='rgba32float')fail('PARAMETER','Depth Matte requires explicit 16F/32F output');
  kernels??=new WeakMap();let pending=kernels.get(gpu);
  if(!pending){
    pending=gpu.compile({abiVersion:2,id:'frameweave/spatial-fields/depth-range-matte',version:'0.1.5',inputCount:0,dataInputs:[{type:'f32'},{type:'f32'}],parameterWords:3,code});
    kernels.set(gpu,pending);
    pending.catch(()=>{if(kernels!.get(gpu)===pending)kernels!.delete(gpu);});
  }
  const kernel=await pending;
  if(gpu.stats().pendingPasses>=gpu.capabilities().maxPendingPasses-1)await gpu.complete({signal:options.signal});
  // Existing run() authenticates BOTH opaque data capabilities against this
  // scope, including released/forged handles, before allocating an image.
  return gpu.run(kernel,[],{data:[depth.data,depth.validity],parameters:Float32Array.of(near,far,softness),signal:options.signal,output:{width:shape.width,height:shape.height,format,alpha:'premultiplied',color:linear709}});
}
