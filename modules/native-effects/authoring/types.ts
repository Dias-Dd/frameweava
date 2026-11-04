import type {FrameContext} from '../../../src/core/types.ts';
import type {NativeStageInit} from '../../native-gpu/authoring.ts';
import type {NativeResource} from '../../native-gpu/resources.ts';
import type {GpuPixelImage} from '../../gpu-effects/pixel-types.ts';
import type {NativeImageProcessOptions} from '../images.ts';

/** Stage-local preparation only; values never become TVG JSON or port handles.
 * A declaration grants no IO permission: init still uses the admitted host. */
export interface ImageAsset<T> {
  prepare(init:NativeStageInit,options:{signal?:AbortSignal}):{value:T;dispose?():void|Promise<void>}|Promise<{value:T;dispose?():void|Promise<void>}>;
}

/** Structural interface implemented by the existing effect factories. */
export interface ImageProcessor<Filters> {
  processImage(image:GpuPixelImage,recipe:(image:GpuPixelImage,filters:Filters)=>Promise<GpuPixelImage>,options?:NativeImageProcessOptions):Promise<GpuPixelImage>;
  generateImage(recipe:(filters:Filters)=>Promise<GpuPixelImage>,options?:NativeImageProcessOptions):Promise<GpuPixelImage>;
  dispose():Promise<void>;
}
export type ImageEffectFactory<Filters>=(init:NativeStageInit)=>ImageProcessor<Filters>;

/** One invocation, never a global current GPU/context. Do not retain this frame. */
export interface ImageFrame {
  readonly init:NativeStageInit;
  readonly context:FrameContext|undefined;
  readonly signal:AbortSignal|undefined;
  process<F>(factory:ImageEffectFactory<F>|ImageAsset<ImageProcessor<F>>,image:GpuPixelImage,recipe:(image:GpuPixelImage,filters:F)=>Promise<GpuPixelImage>):Promise<GpuPixelImage>;
  generate<F>(factory:ImageEffectFactory<F>,recipe:(filters:F)=>Promise<GpuPixelImage>):Promise<GpuPixelImage>;
  /** Declared resources only. The existing host verifies identity/permissions. */
  resource(source:NativeResource):Promise<GpuPixelImage>;
  /** Resolve a borrowed image or an explicitly declared, prepared source.
   * Repeated calls here share a result within one invocation. */
  input(source:ImageInput):Promise<GpuPixelImage>;
  /** Return an already prepared, typed Stage-local value. Never initialize in a frame. */
  asset<T>(declaration:ImageAsset<T>):Promise<T>;
}
export type ImageEffect<C extends ImageFrame=ImageFrame>=((image:GpuPixelImage,frame:C)=>GpuPixelImage|Promise<GpuPixelImage>)&{
  /** Declarative dependencies, prepared once by imageStage, never ambient IO. */
  readonly sources?:readonly ImageSource[];
  readonly assets?:readonly ImageAsset<unknown>[];
};
export type ImageSource<C extends ImageFrame=ImageFrame>=((frame:C)=>GpuPixelImage|Promise<GpuPixelImage>)&{
  /** Optional source-owned preparation; called once by imageStage at init. */
  prepare?:(init:NativeStageInit,options?:{signal?:AbortSignal})=>{source:ImageSource<C>;dispose?():void|Promise<void>}|Promise<{source:ImageSource<C>;dispose?():void|Promise<void>}>;
};
export type ImageInput<C extends ImageFrame=ImageFrame>=GpuPixelImage|ImageSource<C>;
export interface ImageStageFrame<I,P> extends ImageFrame {
  readonly context:FrameContext;
  readonly inputs:I;
  readonly props:P;
}
