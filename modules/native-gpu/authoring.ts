import type {NativeResidentBufferScope} from './resident-buffers.ts';
import type {NativeStageCalls,NativeStagePorts} from '../stage-orchestration/composite-types.ts';
import type {NativeTemporalStage} from './temporal-types.ts';
export type {NativeTemporalStage,NativeTemporalBinding,NativeTemporalBindingRequest,NativeTemporalPrefix,NativeTemporalSource,NativeTemporalSample,NativeTemporalWindowOptions,NativeTemporalCancellation,NativeTemporalCancellationSignal,NativeTemporalSourceRequest,NativeTemporalSourceBinding,NativeTemporalSeek} from './temporal-types.ts';
import type {FrameContext} from '../../src/core/types.ts';
import {FixedStepRunner,type FixedStepOptions} from '../../src/core/simulation.ts';
import type {GpuPixelScope,GpuPixelImage} from '../gpu-effects/pixel-types.ts';
import type {GpuPixelImageInfo} from '../gpu-effects/pixel-types.ts';
import type {GpuDataBuffer} from '../gpu-effects/compute-types.ts';
import type {NativeRayScope} from './rays.ts';
export type {NativeRayGeometry,NativeRayScene,NativeRaySceneOptions,NativeRayRequest,NativeRayResult} from './rays.ts';
import type {NativeInferenceScope} from '../inference/native.ts';
export type {InferenceSource,TensorDescription,InferenceProvider} from '../inference/types.ts';
export type {NativeInferenceModel,NativeInferenceRunOptions} from '../inference/native.ts';
import type {NativeModuleScope} from './module.ts';
import type {NativeStateScope} from './state.ts';
import type {NativeDataOutputScope} from './data-output.ts';
import type {NativeResourceScope} from './resources.ts';
export type {NativeResource,NativeImageResource,NativeVideoResource} from './resources.ts';
export type {NativeRasterResource,NativeFontGlyphResource} from './resources.ts';
export {fontGlyphResource} from './font-image.ts';
import type {NativeColorConversion} from './color.ts';
import type {NativeImageCapabilities} from './image-info.ts';
export type {NativeImageCapabilities} from './image-info.ts';
export type {NativeColorConversion} from './color.ts';
export const NATIVE_LOGIC=Symbol.for('@frameweave/engine.native-gpu-logic');
export interface NativeMeshTexture {
 version:1;image:GpuPixelImage;uvs:GpuDataBuffer;
 filter?:'nearest'|'linear';addressU?:'clamp'|'repeat'|'mirror'|'transparent';addressV?:'clamp'|'repeat'|'mirror'|'transparent';
}
export type NativeMeshRaster =
 | {version:1;mode:'cutout';alphaCutoff?:number}
 | {version:1;mode:'source-over';order:'back-to-front'}
 | {version:1;mode:'depth-peel'};
export interface NativeMeshOptions {positions:GpuDataBuffer;indices?:GpuDataBuffer;count?:number;matrix?:readonly number[];color?:readonly [number,number,number,number];texture?:NativeMeshTexture;raster?:NativeMeshRaster;output:Omit<GpuPixelImageInfo,'version'>}
export interface NativeGpuScope extends GpuPixelScope,NativeModuleScope,NativeInferenceScope,NativeRayScope,NativeStateScope,NativeDataOutputScope,NativeResourceScope {
 createResidentBuffer:NativeResidentBufferScope['createResidentBuffer'];
 createResidentField:NativeResidentBufferScope['createResidentField'];
 replaceResidentBuffer:NativeResidentBufferScope['replaceResidentBuffer'];
 stats():ReturnType<GpuPixelScope['stats']>&{residentBuffers?:{version:1;live:number;bytes:number}};
 capabilities():ReturnType<GpuPixelScope['capabilities']>&{nativeResidentBuffers?:{version:1;readOnly:true;runtimeCreation:true};nativeInference?:{version:1;preallocatedOutputs:true;stateContinuation:true;imageContinuation:'same-frame-prefix-v1';outputAliasing:'forbidden';persistentOutput:'explicit-stateStep'};nativeRayQuery?:{version:1;available:boolean;enabled:boolean;profile:string;experimental:true;maxBlasPrimitives:number;maxTlasInstances:number};nativeImages?:NativeImageCapabilities;nativeMesh?:{version:1;float32Blendable:boolean;exactMaxTriangles?:number;exactAdmission?:'session-budget'}};
 convertColor(image:GpuPixelImage,options:NativeColorConversion):Promise<GpuPixelImage>;
 drawMesh(options:NativeMeshOptions):Promise<GpuPixelImage>;
}
export interface NativeStageInit {stages?:NativeStageCalls;temporal?:NativeTemporalStage;gpu:NativeGpuScope;width:number;height:number;seed:number;resources:Readonly<Record<string,string>>}
export type {NativeStagePreview,PreviewQuality,PreviewQualityOptions} from './preview-quality.ts';
export interface NativeFrameContext extends FrameContext {preview?:import('./preview-quality.ts').NativeStagePreview}
/** Preview can rewind a fixed-step Stage when these hooks capture all authored
 * mutable state, including any authored RNG and accumulators. Return wire
 * data only, never GPU handles. Capture is read-only. Persistent GPU
 * buffers are captured by the owner. Hooks do not record GPU work. */
export interface NativeStageCheckpoint {
 version:1;
 capture():unknown|Promise<unknown>;
 restore(snapshot:unknown):void|Promise<void>;
}
export interface NativeStageInstance<I=Record<string,GpuPixelImage>,P=Record<string,unknown>,O=GpuPixelImage> {
 temporal?:import('./temporal-types.ts').NativeTemporalSeek<I,P>;
 checkpoint?:NativeStageCheckpoint;
 renderAt(context:NativeFrameContext,inputs:I,props:P):O|Promise<O>;
 dispose?():void|Promise<void>;
}
export type NativeStageFactory<I=Record<string,GpuPixelImage>,P=Record<string,unknown>,O=GpuPixelImage>=((init:NativeStageInit)=>NativeStageInstance<I,P,O>|Promise<NativeStageInstance<I,P,O>>)&{[NATIVE_LOGIC]:true};
/** JS remains ordinary JS. Only media commands are sent to the native owner. */
export function defineNativeStage<I=Record<string,GpuPixelImage>,P=Record<string,unknown>,O=GpuPixelImage>(factory:(init:NativeStageInit)=>NativeStageInstance<I,P,O>|Promise<NativeStageInstance<I,P,O>>):NativeStageFactory<I,P,O>{
 Object.defineProperty(factory,NATIVE_LOGIC,{value:true});return factory as NativeStageFactory<I,P,O>;
}
/** Explicit cloneable state reuses the existing deterministic seek runner.
 * Restoring keeps the top-level object identity used by authored closures. */
export function nativeSimulation<S extends object>(state:S,update:(dt:number,step:number)=>void,options:FixedStepOptions){
 const initial=structuredClone(state),restore=(s:S)=>{for(const key of Object.keys(state))delete (state as Record<string,unknown>)[key];Object.assign(state,structuredClone(s));};
 return new FixedStepRunner<S>({reset:()=>restore(initial),step:update,snapshot:()=>structuredClone(state),restore},options);
}

export * from '../gpu-effects/index.ts';
export * from '../../src/media/surface.ts';

export type {NativeBufferResource,NativeResourceBuffer,NativeDeepBufferResource} from './binary-resource.ts';

export type {GpuPixelImage,GpuPixelScope,GpuPixelImageInfo} from '../gpu-effects/pixel-types.ts';

export {createNativeReplay} from '../spatial-compute/native-replay.ts';
export type {NativeReplayOptions,NativeReplayStep} from '../spatial-compute/native-replay.ts';
export type {NativeStateFlushOptions} from './state.ts';

/** SO-2 control logic runs in its own ordinary isolated Native realm. */
export function defineCompositeStage<I=NativeStagePorts,P=Record<string,unknown>,O extends NativeStagePorts=NativeStagePorts>(factory:(init:NativeStageInit&{stages:NativeStageCalls})=>NativeStageInstance<I,P,O>|Promise<NativeStageInstance<I,P,O>>):NativeStageFactory<I,P,O>{
 return defineNativeStage(factory as (init:NativeStageInit)=>NativeStageInstance<I,P,O>|Promise<NativeStageInstance<I,P,O>>);
}
export type {NativeStageCalls,NativeStagePorts,NativeStageCallResult} from '../stage-orchestration/composite-types.ts';

export type {NativeResidentBufferScope} from './resident-buffers.ts';
