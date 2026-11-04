import {EngineError} from '../../src/core/errors.ts';
import {pixelMetadata} from '../gpu-effects/pixel-shader.ts';
import type {GpuPixelImageInfo} from '../gpu-effects/pixel-types.ts';
import type {GpuComputeCapabilities} from '../gpu-effects/compute-capabilities.ts';

export interface NativeImageCapabilities {version:1;admission:'device-and-session-budget';maxTextureDimension2D:number}
type Admission=Pick<GpuComputeCapabilities,'hardwareVerified'|'limits'>&{nativeImages?:NativeImageCapabilities};
/** No pixel-count policy. U32 addressing is an ABI boundary; actual buffers,
 * dispatches and render attachments use independently reported device limits.
 * Without a device proof this records provisional metadata, never permission
 * to allocate. Native admission rechecks hardware and the full frame budget. */
export function nativePixelInfo(o:Omit<GpuPixelImageInfo,'version'>,device?:Admission):GpuPixelImageInfo{
 const info=pixelMetadata(o),pixels=info.width*info.height,bytes=pixels*16;
 if(pixels*4>0xffffffff)throw new EngineError('E_NATIVE_IMAGE_LIMIT','Image exceeds the U32 component-index address space',{details:{width:info.width,height:info.height,workingBytes:bytes,reason:'u32-addressing'}});
 if(device?.hardwareVerified){const l=device.limits;
  if(bytes>l.maxBufferSize||bytes>l.maxStorageBufferBindingSize)throw new EngineError('E_NATIVE_IMAGE_LIMIT','Image exceeds an actual device buffer limit',{details:{workingBytes:bytes,maxBufferSize:l.maxBufferSize,maxStorageBufferBindingSize:l.maxStorageBufferBindingSize}});
  if(Math.ceil(info.width/8)>l.maxComputeWorkgroupsPerDimension||Math.ceil(info.height/8)>l.maxComputeWorkgroupsPerDimension)throw new EngineError('E_NATIVE_IMAGE_LIMIT','Image exceeds the actual pixel dispatch limit',{details:{width:info.width,height:info.height,maxComputeWorkgroupsPerDimension:l.maxComputeWorkgroupsPerDimension}});
 }return info;
}
export function nativeTextureInfo(info:GpuPixelImageInfo,device?:Admission){
 const limit=device?.hardwareVerified?device.nativeImages?.maxTextureDimension2D:undefined;
 if(limit!==undefined&&(info.width>limit||info.height>limit))throw new EngineError('E_NATIVE_IMAGE_LIMIT','Mesh attachment exceeds the actual device texture limit',{details:{width:info.width,height:info.height,maxTextureDimension2D:limit}});
}
