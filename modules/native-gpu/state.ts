import type {GpuDataBuffer,GpuBufferDescriptor,GpuFieldDescriptor,GpuWords} from '../gpu-effects/compute-types.ts';
export interface NativeStateDefinition {version:1;id:string}
/** Explicit ordered GPU history, separate from immutable inputs and JS state.
 * Start/reset at step 0 with a fresh epoch; subsequent steps must be consecutive.
 * For seeking, reset and record the required steps again. No CPU snapshots. */
export interface NativeStateStep {version:1;epoch:number;step:number;reset?:boolean;signal?:AbortSignal}
export interface NativeStateFlushOptions {version:1;signal?:AbortSignal}
export interface NativeStateScope {
 /** Await a bounded same-frame pixel/color/compute/inference/state segment on the SAME owner and frame. Flush at a complete step boundary. */
 flushState(options:NativeStateFlushOptions):Promise<void>;
 createStateBuffer(descriptor:GpuBufferDescriptor,data:GpuWords|undefined,state:NativeStateDefinition):Promise<GpuDataBuffer>;
 createStateField(descriptor:GpuFieldDescriptor,data:GpuWords|undefined,state:NativeStateDefinition):Promise<GpuDataBuffer>;
 stateStep(buffers:readonly GpuDataBuffer[],step:NativeStateStep):Promise<void>;
}
