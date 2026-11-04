import type {FrameContext,Signal} from '../../src/core/types.ts';
import type {GpuPixelImage} from '../gpu-effects/pixel-types.ts';
import type {NativePixelDescription} from './program.ts';
export interface NativeTemporalSample {readonly index:number;readonly time:number;readonly weight:number;readonly context:Readonly<FrameContext>}
export type NativeTemporalSource=(sample:Readonly<NativeTemporalSample>)=>Promise<GpuPixelImage>;
/** Resource module bytes, not a render callback or another Stage. */
export interface NativeTemporalPrefix {version:1;profile:'native-pixel-prefix-v1';id:string;steps:readonly {description:NativePixelDescription;parameters:readonly Signal<number>[]}[]}
export interface NativeTemporalBindingRequest {version:1;packageRef:string;module:string}
declare const temporalCancellationBrand:unique symbol;
/** Opaque, service-local cancellation token; not a DOM AbortSignal. */
export interface NativeTemporalCancellationSignal {readonly version:1;readonly [temporalCancellationBrand]:true}
export interface NativeTemporalCancellation {readonly signal:NativeTemporalCancellationSignal;abort():void}
export interface NativeTemporalWindowOptions {parameters?:readonly (readonly Signal<number>[])[];signal?:AbortSignal|NativeTemporalCancellationSignal}
export interface NativeTemporalBinding {
 readonly info:{version:1;profile:'native-pixel-prefix-v1';id:string;packageRef:string;module:string;integrity:string;ownership:'stage-local'};
 window(context:Readonly<FrameContext>,options:NativeTemporalWindowOptions,consume:(sourceAt:NativeTemporalSource)=>GpuPixelImage|Promise<GpuPixelImage>):Promise<GpuPixelImage>;
 dispose():Promise<void>;
}
export interface NativeTemporalStage {bind(request:NativeTemporalBindingRequest):Promise<NativeTemporalBinding>;bindSource(request:NativeTemporalSourceRequest):Promise<NativeTemporalSourceBinding>;cancellation():NativeTemporalCancellation}

/** Core resolves only a declared input or declared Resource; no callback/path authority. */
export type NativeTemporalSourceRequest =
 | {version:1;profile:'declared-input-v1';input:string;clock:'consumer-local'|'composition'}
 | {version:1;profile:'declared-resource-v1';source:import('./resources.ts').NativeImageResource;clock?:never;ticksPerSecond?:never}
 | {version:1;profile:'declared-resource-v1';source:Omit<import('./resources.ts').NativeVideoResource,'position'>;clock:'local'|'global';ticksPerSecond:number};
export interface NativeTemporalSourceBinding extends Omit<NativeTemporalBinding,'info'> {
 readonly info:{version:1;profile:'declared-input-v1'|'declared-resource-v1';id:string;ownership:'stage-local'};
}
/** Explicit authored seek contract, invoked only in an isolated branch instance.
 * Implement with an existing FixedStepRunner/checkpoint/seek adapter. Ordinary
 * renderAt/stateless labels are never inferred to implement this contract. */
export interface NativeTemporalSeek<I,P> {
 version:1;profile:'isolated-seek-v1';
 sampleAt(context:FrameContext,inputs:I,props:P):GpuPixelImage|Promise<GpuPixelImage>;
}
