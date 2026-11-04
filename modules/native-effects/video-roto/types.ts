import type {InferenceSource} from '../../inference/types.ts';
import type {GpuDataBuffer} from '../../gpu-effects/compute-types.ts';
import type {GpuPixelImage,GpuPixelImageInfo} from '../../gpu-effects/pixel-types.ts';

/** Learned context sizes belong to this trained profile, not video duration. */
export interface VideoRotoBundle {
 readonly version:1;
 readonly profile:'sam2.1-base-plus-video-memory-f32-v1';
 readonly vision:InferenceSource;readonly seed:InferenceSource;readonly track:InferenceSource;
 readonly temporal:readonly number[];
 readonly pointerProjectionWeight:readonly number[];
 readonly pointerProjectionBias:readonly number[];
}
export interface VideoRotoOptions {
 readonly id:string;
 /** Absolute, explicit source-frame indices. No automatic upstream evaluation. */
 readonly seedFrame:number;readonly frame:number;readonly totalFrames:number;
 readonly seedMask:GpuPixelImage;
 /** Operator work budget; caller may raise it. Does not truncate the sequence. */
 readonly maxReplayFrames?:number;
 /** Observed frames per same-frame owner submission. Zero disables cuts.
  * Default8 when the matching Core advertises continuation; otherwise zero. */
 readonly segmentFrames?:number;
 readonly threshold?:number;readonly softness?:number;
 readonly analysisBackground?:readonly[number,number,number];
 readonly format?:GpuPixelImageInfo['format'];readonly signal?:AbortSignal;
}
export interface VideoRotoResult {
 readonly kind:'native-video-roto-result';readonly version:1;readonly id:string;
 readonly frame:number;readonly image:GpuPixelImage;readonly mask:GpuDataBuffer;
 readonly objectScore:GpuDataBuffer;readonly memory:GpuDataBuffer;
 readonly observedFrames:number;readonly missingFrames:number;
}
export interface VideoRotoFilters {
 trackVideoRoto(image:GpuPixelImage,sourceAt:(frame:number)=>Promise<GpuPixelImage|undefined>,options:VideoRotoOptions):Promise<VideoRotoResult>;
}
export interface VideoRotoInspection {
 inspect?:(event:{id:string;frame:number;name:'pixels'|'high0'|'high1'|'features'|'logits'|'memory'|'pointer'|'object_score'|'mask'|'memory_pos'|'pointer_pos'|'valid'|'spatial_memory'|'object_pointers';buffer:GpuDataBuffer})=>Promise<void>;
}
