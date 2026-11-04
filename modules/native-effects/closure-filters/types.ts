import type {Signal} from '../../../src/core/types.ts';
import type {ColorEncoding} from '../../../src/media/surface.ts';
import type {GpuPixelImage,GpuPixelImageInfo,GpuPixelKernelSourceV2} from '../../gpu-effects/pixel-types.ts';
import type {GpuDataBuffer} from '../../gpu-effects/compute-types.ts';
export type Triple=readonly [Signal<number>,Signal<number>,Signal<number>];
export type Point=readonly [Signal<number>,Signal<number>];
export interface ClosureOutput {format?:'rgba16float'|'rgba32float';workingColor?:ColorEncoding;amount?:Signal<number>;signal?:AbortSignal}
export interface CrossOptions extends ClosureOutput {radius?:Signal<number>}
export interface RadialOptions extends ClosureOutput {center?:Point;length?:Signal<number>;samples?:number;mode?:'mean'|'brightest'|'darkest'}
export interface VectorOptions extends ClosureOutput {scale?:Signal<number>;samples?:number}
export interface Psf {width:number;height:number;weights:readonly number[]}
export interface DeblurOptions extends ClosureOutput {psf:Psf;iterations?:number;step?:Signal<number>;regularization?:Signal<number>}
export interface CalculateOptions extends ClosureOutput {source?:'red'|'green'|'blue'|'alpha'|'luma';reference?:'red'|'green'|'blue'|'alpha'|'luma';operator?:'add'|'subtract'|'multiply'|'divide'|'min'|'max'|'difference';epsilon?:Signal<number>}
export type ChannelModel='rgb'|'yuv'|'yiq'|'hsl';
export interface NativeChannelPack {readonly kind:'native-channel-pack';readonly version:1;readonly width:number;readonly height:number;readonly model:ChannelModel;readonly source:Readonly<GpuPixelImageInfo>;readonly buffer:GpuDataBuffer;readonly inverse:readonly number[]}
export interface PackOptions {model?:ChannelModel;signal?:AbortSignal}
export interface NeutralOptions extends ClosureOutput {point?:Point;strength?:Signal<number>;epsilon?:Signal<number>}
export interface OffsetOptions extends ClosureOutput {offset?:Triple;period?:Signal<number>}
export interface ColoramaOptions extends ClosureOutput {colors:readonly Triple[];phase?:Signal<number>;cycles?:Signal<number>}
export interface MatchOptions extends ClosureOutput {strength?:Signal<number>;epsilon?:Signal<number>}
export interface StabilizeOptions extends ClosureOutput {points?:readonly [Point,Point,Point];strength?:Signal<number>;epsilon?:Signal<number>}
export interface GrainOptions extends ClosureOutput {radius?:Signal<number>;strength?:Signal<number>;seed?:number}
export interface AlphaNoiseOptions extends ClosureOutput {noise?:Signal<number>;seed?:number;animated?:boolean}
export interface HlsNoiseOptions extends ClosureOutput {hue?:Signal<number>;lightness?:Signal<number>;saturation?:Signal<number>;seed?:number;animated?:boolean}
export interface BurstOptions extends ClosureOutput {center?:Point;length?:Signal<number>;intensity?:Signal<number>;samples?:number}
export interface SweepOptions extends ClosureOutput {center?:Point;angle?:Signal<number>;width?:Signal<number>;intensity?:Signal<number>;color?:Triple}
export interface EyedropperOptions extends ClosureOutput {point?:Point;radius?:number}
export interface NativeDisplayData {readonly kind:'native-ocio-display-data';readonly schemaVersion:1;readonly width:number;readonly height:number;readonly encoding:'f32-rgba-interleaved';readonly logicalFormat:'rgba16float'|'rgba32float';readonly alpha:'premultiplied';readonly color:ColorEncoding;readonly buffer:GpuDataBuffer}
export type OcioKind='color-space'|'display'|'file'|'look';
export type {OcioUniform,OcioUniformType,OcioUniformValues,OcioUniformValue} from './ocio/uniforms.ts';
interface OcioProvenance {ocioVersion:string;configSha256:string;processorCacheId:string;glslSha256:string;wgslSha256:string;lutSha256:string;compilerSha256:string;resources:readonly {path:string;sha256:string}[]}
interface OcioBase {kind:'native-ocio';operation:OcioKind;inputColor:ColorEncoding;outputColor:ColorEncoding;kernel:GpuPixelKernelSourceV2;lutValues:readonly number[]}
export type OcioDefinition=OcioBase&({schemaVersion:1;uniforms?:never;provenance:OcioProvenance&{uniformSha256?:never}}|{schemaVersion:2;uniforms:readonly import('./ocio/uniforms.ts').OcioUniform[];provenance:OcioProvenance&{uniformSha256:string}});
export interface OcioOptions extends ClosureOutput {uniforms?:import('./ocio/uniforms.ts').OcioUniformValues}
export interface NativeClosureFilters {
 crossBlur(image:GpuPixelImage,options?:CrossOptions):Promise<GpuPixelImage>;
 fastRadialBlur(image:GpuPixelImage,options?:RadialOptions):Promise<GpuPixelImage>;
 vectorBlur(image:GpuPixelImage,motion:GpuDataBuffer,options?:VectorOptions):Promise<GpuPixelImage>;
 motionDeblur(image:GpuPixelImage,options:DeblurOptions):Promise<GpuPixelImage>;
 channelCalculations(image:GpuPixelImage,reference:GpuPixelImage,options?:CalculateOptions):Promise<GpuPixelImage>;
 channelCombine(image:GpuPixelImage,options?:PackOptions):Promise<NativeChannelPack>;
 channelDecode(pack:NativeChannelPack,options?:ClosureOutput):Promise<GpuPixelImage>;
 colorNeutralize(image:GpuPixelImage,options?:NeutralOptions):Promise<GpuPixelImage>;
 colorOffsetCycle(image:GpuPixelImage,options?:OffsetOptions):Promise<GpuPixelImage>;
 colorama(image:GpuPixelImage,options:ColoramaOptions):Promise<GpuPixelImage>;
 colorMatch(image:GpuPixelImage,reference:GpuPixelImage,options?:MatchOptions):Promise<GpuPixelImage>;
 colorStabilize(image:GpuPixelImage,reference:GpuPixelImage,options?:StabilizeOptions):Promise<GpuPixelImage>;
 matchGrain(image:GpuPixelImage,reference:GpuPixelImage,options?:GrainOptions):Promise<GpuPixelImage>;
 noiseAlpha(image:GpuPixelImage,options?:AlphaNoiseOptions):Promise<GpuPixelImage>;
 noiseHls(image:GpuPixelImage,options?:HlsNoiseOptions):Promise<GpuPixelImage>;
 lightBurst(image:GpuPixelImage,options?:BurstOptions):Promise<GpuPixelImage>;
 lightSweep(image:GpuPixelImage,options?:SweepOptions):Promise<GpuPixelImage>;
 eyedropperFill(image:GpuPixelImage,options?:EyedropperOptions):Promise<GpuPixelImage>;
 ocioColorSpaceTransform(image:GpuPixelImage,processor:OcioDefinition,options?:OcioOptions):Promise<GpuPixelImage>;
 ocioDisplayTransform(image:GpuPixelImage,processor:OcioDefinition,options?:OcioOptions):Promise<NativeDisplayData>;
 ocioFileTransform(image:GpuPixelImage,processor:OcioDefinition,options?:OcioOptions):Promise<GpuPixelImage>;
 ocioLookTransform(image:GpuPixelImage,processor:OcioDefinition,options?:OcioOptions):Promise<GpuPixelImage>;
}
export const nativeClosureNames=['crossBlur','fastRadialBlur','vectorBlur','motionDeblur','channelCalculations','channelCombine','channelDecode','colorNeutralize','colorOffsetCycle','colorama','colorMatch','colorStabilize','matchGrain','noiseAlpha','noiseHls','lightBurst','lightSweep','eyedropperFill','ocioColorSpaceTransform','ocioDisplayTransform','ocioFileTransform','ocioLookTransform'] as const satisfies readonly (keyof NativeClosureFilters)[];
