import type {Signal,Rational} from '../../../src/core/types.ts';import type {ColorEncoding} from '../../../src/media/surface.ts';import type {GpuPixelImage} from '../../gpu-effects/pixel-types.ts';import type {GpuDataBuffer} from '../../gpu-effects/compute-types.ts';import type {ClosureOutput} from '../closure-filters/types.ts';import type {FlowOptions,MotionField} from '../image-estimation/types.ts';
export type Output=ClosureOutput;
export type Observation={time:Rational;observed:false}|{time:Rational;observed?:true;image:GpuPixelImage;motion?:MotionField};
export interface DenoiseOptions extends Output {time:Rational;windowSeconds?:Signal<number>;maximumGapSeconds?:Signal<number>;timeSigmaSeconds?:Signal<number>;rangeSigma?:Signal<number>;noiseSigma?:Signal<number>;motionSensitivity?:Signal<number>;minimumConfidence?:Signal<number>;strength?:Signal<number>;channelStrength?:readonly[Signal<number>,Signal<number>,Signal<number>];flowOptions?:FlowOptions}
export interface GrainProfileOptions extends Pick<Output,'workingColor'|'signal'> {samplePeriod:Rational;radius?:number;temporalRadius?:number;oversampling?:number;preblurSigma?:Signal<number>;analysisStride?:number;batchPatches?:number;maxWorkingBytes?:number;window?:'hann'|'box';regularization?:Signal<number>}
export interface TemporalGrainProfile {readonly kind:'native-temporal-grain-profile';readonly version:1;readonly radius:number;readonly temporalRadius:number;readonly spatialBins:number;readonly temporalBins:number;readonly period:Rational;readonly color:ColorEncoding;readonly observations:number;readonly spectrum:GpuDataBuffer;readonly factor:GpuDataBuffer;readonly kernel:GpuDataBuffer;readonly scale:GpuDataBuffer;readonly diagnostics:GpuDataBuffer}
export interface GrainSynthesisOptions extends Output {time:Rational;originTime?:Rational;seed?:number;strength?:Signal<number>;channelStrength?:readonly[Signal<number>,Signal<number>,Signal<number>]}
export interface GrainMatchOptions extends DenoiseOptions {profile:GrainProfileOptions;synthesis?:Omit<GrainSynthesisOptions,'time'|'workingColor'|'signal'|'format'|'amount'>}
export interface SpectrumOptions extends Output {temporalBin?:number;row?:'red'|'green'|'blue';column?:'red'|'green'|'blue';component?:'power'|'real'|'imaginary';exposure?:Signal<number>}
export interface TemporalInspection {publish(name:string,buffer:GpuDataBuffer):Promise<void>}
export interface NativeTemporalFilters {
 temporalDenoise(image:GpuPixelImage,samples:readonly Observation[],options:DenoiseOptions):Promise<GpuPixelImage>;
 temporalGrainProfile(samples:readonly Observation[],options:GrainProfileOptions):Promise<TemporalGrainProfile>;
 synthesizeTemporalGrain(image:GpuPixelImage,profile:TemporalGrainProfile,options:GrainSynthesisOptions):Promise<GpuPixelImage>;
 matchTemporalGrain(image:GpuPixelImage,source:readonly Observation[],reference:readonly Observation[],options:GrainMatchOptions):Promise<GpuPixelImage>;
 temporalSpectrumView(image:GpuPixelImage,profile:TemporalGrainProfile,options?:SpectrumOptions):Promise<GpuPixelImage>;
}
