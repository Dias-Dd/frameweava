// SPDX-License-Identifier: Apache-2.0
import type {FrameContext,Signal} from '../../../../src/core/types.ts';
import type {GpuPixelImage,GpuPixelImageInfo} from '../../../gpu-effects/pixel-types.ts';
import type {NativeGpuScope,NativeStageInit} from '../../../native-gpu/authoring.ts';
import type {SourceTimeRange,TimeSample} from './plans.ts';

/** The callback explicitly samples its own procedural/media source. It cannot seek another Stage.
 * Each invocation transfers one fresh, same-owner image. Never return a recipe-retained image
 * that the next callback invocation will retire. No pixel inference or frame decoding is implicit. */
export type NativeTimeSource=(sample:Readonly<TimeSample>)=>GpuPixelImage|Promise<GpuPixelImage>;
export type NativeTimeOutput=Omit<GpuPixelImageInfo,'version'|'alpha'>;
export type TemporalReduction='weighted-mean'|'add'|'blend'|'maximum'|'minimum'|'screen'|'in-front'|'in-back';
export interface TemporalImageSample {readonly image:GpuPixelImage|null;readonly weight:number}
/** Thin integration seam for Agent-3's shared GPU kernels. This is neither a host nor a scheduler.
 * consume borrowed images synchronously before advancing/closing the iterator. Never release
 * them. Null means a real transparent zero sample and still participates in the denominator.
 * return a new caller-owned PM image, scene-linear, with one final F16/F32 publication.
 * Implementations must retain compensated residuals between samples for sums/means, clamp ONLY
 * final Alpha, and must not create another GPU owner, use CPU pixels or introduce SDR storage. */
export interface NativeTemporalPixelAdapter {
 readonly profile:'native-temporal-compensated-v1';
 reduce(gpu:NativeGpuScope,samples:AsyncIterable<TemporalImageSample>,options:{mode:TemporalReduction;output:NativeTimeOutput;signal?:AbortSignal;sampleCount:number;weights:Iterable<number>}):Promise<GpuPixelImage>;
}
export interface NativeTimeEnvironment extends Pick<NativeStageInit,'gpu'|'width'|'height'> {
 /** Defaults scene-linear Rec.709/F32; different source encodings require explicit conversion. */
 color?:GpuPixelImageInfo['color'];format?:GpuPixelImageInfo['format'];
}
export interface NativeTimeOptions {format?:GpuPixelImageInfo['format'];signal?:AbortSignal;range?:SourceTimeRange}
export interface RetimeOptions extends NativeTimeOptions {
 time?:Signal<number>;fps?:number|{num:number;den:number};origin?:number;method?:'exact'|'hold'|'nearest'|'linear';
}
