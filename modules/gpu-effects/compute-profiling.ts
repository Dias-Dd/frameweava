/// <reference types="@webgpu/types" />
export interface GpuPassTiming {readonly id:string;readonly phase:'pixel'|'compute'|'validation';readonly gpuMs:number|null}
export interface GpuScopeTimings {readonly version:1;readonly status:'disabled'|'unavailable'|'idle'|'pending'|'ready'|'truncated';readonly batch:number;readonly droppedPasses:number;readonly resolutionNs:null;readonly gpuSumMs:number|null;readonly passes:readonly GpuPassTiming[];readonly scope:'GPU passes only; not host/transfer/PNG/display latency'}
