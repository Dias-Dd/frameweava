import type {GpuDataBuffer} from '../gpu-effects/compute-types.ts';import type {InferenceSource} from './types.ts';
export interface NativeInferenceModel {readonly info:Readonly<InferenceSource>}
/** Output storage is borrowed, never transferred. Exact names/F32 lengths,
 * distinct writable owner-local buffers; no input/output aliasing. Persistent
 * destinations require the existing explicit stateStep before execution. */
export interface NativeInferenceRunOptions {outputs?:Readonly<Record<string,GpuDataBuffer>>;signal?:AbortSignal}
export interface NativeInferenceScope {
 createInference(source:InferenceSource):Promise<NativeInferenceModel>;
 runInference(model:NativeInferenceModel,inputs:Readonly<Record<string,GpuDataBuffer>>,options?:NativeInferenceRunOptions):Promise<Record<string,GpuDataBuffer>>;
 releaseInference(model:NativeInferenceModel):Promise<void>;
}
/** File is host-resolved inside the existing verified resource lease. */
export interface NativeInferenceDefinition extends InferenceSource{file:string}
