import type {AlphaMode,ColorEncoding,ProfessionalSurface} from '../../src/media/surface.ts';
import type {GpuComputeScopeApi,GpuDataBuffer,GpuWordType} from './compute-types.ts';
import type {GpuComputeCapabilities} from './compute-capabilities.ts';
import type {GpuScopeTimings} from './compute-profiling.ts';

declare const imageBrand:unique symbol,kernelBrand:unique symbol;
export interface GpuPixelImageInfo {
 readonly version:1;readonly width:number;readonly height:number;
 readonly format:'rgba16float'|'rgba32float';readonly alpha:AlphaMode;readonly color:Readonly<ColorEncoding>;
}
/** Owner-local capability, never a Stage port or serialized Surface. */
export interface GpuPixelImage {readonly [imageBrand]:true;readonly info:GpuPixelImageInfo;readonly toJSON:()=>never}
export interface GpuPixelKernelSourceV1 {
 abiVersion:1;id:string;version:string;inputCount:number;parameterWords:number;
 /** WGSL helpers plus fn pixel(p:vec2u)->vec4f. No entry points or bindings.
  * Source must be carried by sealed Stage code / verified Resources. No fetch. */
 code:string;
}
export interface GpuPixelKernelSourceV2 extends Omit<GpuPixelKernelSourceV1,'abiVersion'> {abiVersion:2;dataInputs:readonly {type:GpuWordType}[]}
export type GpuPixelKernelSource=GpuPixelKernelSourceV1|GpuPixelKernelSourceV2;
export interface GpuPixelKernel {readonly [kernelBrand]:true;readonly info:Readonly<(Omit<GpuPixelKernelSourceV1,'code'>|Omit<GpuPixelKernelSourceV2,'code'>)&{sha256:string}>;readonly toJSON:()=>never}
export interface GpuPixelScopeOptions {maxBufferBytes?:number;maxPendingPasses?:number;maxKernels?:number}
export interface GpuPixelDisplayOptions {profile:'aces2-sdr100-v1';clip:true;signal?:AbortSignal}
export interface GpuPixelPresentation {
 readonly version:1;readonly canvas:HTMLCanvasElement;readonly profile:'aces2-sdr100-v1';
 readonly displayPrecision:'rgba8unorm';readonly completion:'gpu-ready-only';readonly clippedSamples:number;
}
export interface GpuPixelRunOptions {
 parameters?:Float32Array|Uint32Array;
 /** ABI v2 only: non-color typed fields/buffers, never RGBA disguises. */
 data?:readonly GpuDataBuffer[];
 /** Defaults to the first input. Generators must supply all output metadata. */
 output?:Partial<Omit<GpuPixelImageInfo,'version'>>;signal?:AbortSignal;
}
export interface GpuPixelScopeStats {
 /** Optional recording hint; false keeps mixed programs whole. Not a capacity. */
 stateSegmentEligible?:boolean;
 version:1;backend:'webgpu'|'native-wgpu';uploads:number;uploadBytes:number;runs:number;submissions:number;
 readbacks:number;readbackBytes:number;validationReadbackBytes:number;pendingPasses:number;
 activeImages:number;liveBytes:number;peakOwnedBytes:number;buffersCreated:number;buffersDestroyed:number;
 reusedBuffers:number;compiledKernels:number;failed:boolean;disposed:boolean;physicalGpuMemoryBytes:null;
 activeDataBuffers:number;bufferUploadBytes:number;bufferReadbacks:number;bufferReadbackBytes:number;
 queryReadbackBytes:number;
 presentations:number;
}
export interface GpuPixelScope extends GpuComputeScopeApi {
 /** Optional v1 read-only view of existing F32 working RGBA components. No
  * transfer or colour/Alpha conversion; cloneBuffer creates a writable copy. */
 imageToBuffer?(image:GpuPixelImage,options:{version:1;signal?:AbortSignal}):Promise<GpuDataBuffer>;
 capabilities():GpuComputeCapabilities;
 timings():GpuScopeTimings;
 upload(surface:ProfessionalSurface,options?:{signal?:AbortSignal}):Promise<GpuPixelImage>;
 compile(source:GpuPixelKernelSource):Promise<GpuPixelKernel>;
 /** Records work. Result remains provisional until complete/readback succeeds. */
 run(kernel:GpuPixelKernel,inputs:readonly GpuPixelImage[],options?:GpuPixelRunOptions):Promise<GpuPixelImage>;
 /** Validates all pending logical publications and waits for the queue. */
 complete(options?:{signal?:AbortSignal}):Promise<void>;
 readback(image:GpuPixelImage,options?:{signal?:AbortSignal}):Promise<ProfessionalSurface>;
 /** Explicit approximate display; never a professional/HDR intermediate.
  * Borrows the same owner's Canvas2D, without exposing a GPU context/device. */
 present(image:GpuPixelImage,options:GpuPixelDisplayOptions):Promise<GpuPixelPresentation>;
 release(image:GpuPixelImage):Promise<void>;
 stats():GpuPixelScopeStats;
 dispose():Promise<void>;
}
