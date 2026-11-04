import {pixelMetadata} from './pixel-shader.ts';
import type {GpuPixelImageInfo} from './pixel-types.ts';
import type {GpuFieldDescriptor} from './compute-types.ts';
import {fieldInfo} from './compute-contract.ts';

export interface GpuComputeCapabilities {
 readonly nativeResidentBuffers?:{version:1;readOnly:true;runtimeCreation:true};
 readonly version:1;readonly backend:'webgpu'|'native-wgpu';readonly hardwareVerified:boolean;
 readonly execution?:'device'|'recording';
 readonly pixelKernelAbis:readonly [1,2];readonly computeKernelAbis:readonly [1];
 readonly storageTypes:readonly ['f32','u32','i32'];readonly maxPendingPasses:number;readonly maxKernels:number;
 readonly f16WorkingBytesPerPixel:16;readonly crossStageGpuHandles:false;
 readonly profiling:'enabled'|'disabled'|'unavailable';
 readonly limits:Readonly<{maxBufferSize:number;maxStorageBufferBindingSize:number;maxStorageBuffersPerShaderStage:number;maxUniformBufferBindingSize:number;maxComputeWorkgroupsPerDimension:number;maxComputeInvocationsPerWorkgroup:number;maxComputeWorkgroupSizeX:number;maxComputeWorkgroupSizeY:number;maxComputeWorkgroupSizeZ:number;maxComputeWorkgroupStorageSize:number}>;
}
/** Logical tightly packed storage, not physical driver memory or a peak promise. */
export function estimateGpuImage(info:Omit<GpuPixelImageInfo,'version'>){const s=pixelMetadata(info),n=s.width*s.height;return Object.freeze({version:1,workingBytes:n*16,professionalReadbackBytes:n*16,publicationBytes:n*(s.format==='rgba16float'?8:16),physicalGpuBytes:null});}
export function estimateGpuField(descriptor:GpuFieldDescriptor){const s=fieldInfo(descriptor);return Object.freeze({version:1,workingBytes:s.byteLength,readbackBytes:s.byteLength,physicalGpuBytes:null});}
