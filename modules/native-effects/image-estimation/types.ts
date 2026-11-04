import type {Signal,Rational} from '../../../src/core/types.ts';
import type {GpuPixelImage} from '../../gpu-effects/pixel-types.ts';
import type {GpuDataBuffer} from '../../gpu-effects/compute-types.ts';
import type {ClosureOutput} from '../closure-filters/types.ts';
export type Output=ClosureOutput;
/** Data fields have no image format or opacity publication. */
export type FieldOutput=Pick<Output,'workingColor'|'signal'>;
/** Current centres -> matching reference centres. Explicit image pair is one
 * sample interval, not an implicit video frame/time or persistent TrackData. */
export interface MotionField {readonly kind:'native-motion-field';readonly version:1;readonly width:number;readonly height:number;readonly buffer:GpuDataBuffer}
export interface FlowOptions extends FieldOutput {levels?:number;iterations?:number;radius?:number;epsilon?:Signal<number>;maxStep?:Signal<number>;photometricSigma?:Signal<number>}
export interface ConsistencyOptions extends FieldOutput {threshold?:Signal<number>;minimumConfidence?:Signal<number>}
export interface FlowWarpOptions extends Output {scale?:Signal<number>;boundary?:'transparent'|'clamp'|'repeat'|'mirror';missing?:'retain'|'transparent'}
export interface MotionViewOptions extends Output {scale?:Signal<number>;component?:'direction'|'confidence'|'magnitude'}
export type MotionKind='translation'|'similarity'|'affine'|'homography';
export interface MotionModel {readonly kind:'native-motion-model';readonly version:1;readonly model:MotionKind;readonly width:number;readonly height:number;readonly matrix:GpuDataBuffer;readonly diagnostics:GpuDataBuffer}
export interface FitOptions extends FieldOutput {fitIterations?:number;sampleStep?:number;robustRadius?:Signal<number>;minimumConfidence?:Signal<number>;regularization?:Signal<number>}
export interface MotionWarpOptions extends Output {inverse?:boolean;strength?:Signal<number>;boundary?:'transparent'|'clamp'|'repeat'|'mirror';crop?:'none'}
export interface StabilizeOptions extends FlowOptions,FitOptions,Output {model?:MotionKind;strength?:Signal<number>;crop?:'none'}
export interface RollingModel {readonly kind:'native-rolling-model';readonly version:1;readonly width:number;readonly height:number;readonly direction:'top-to-bottom'|'bottom-to-top'|'left-to-right'|'right-to-left';readonly coefficients:GpuDataBuffer;readonly diagnostics:GpuDataBuffer}
export interface RollingOptions extends FitOptions {direction?:RollingModel['direction']}
export interface RollingRepairOptions extends FlowOptions,RollingOptions,Output {strength?:Signal<number>;boundary?:'transparent'|'clamp'}
export interface BlurKernel {readonly kind:'native-blur-kernel';readonly version:1;readonly width:number;readonly height:number;readonly weights:GpuDataBuffer;readonly diagnostics:GpuDataBuffer}
export interface KernelOptions extends FieldOutput {radius?:number;iterations?:number;regularization?:Signal<number>;edgeThreshold?:Signal<number>}
export interface DeblurOptions extends KernelOptions,Output {imageIterations?:number;step?:Signal<number>;noise?:Signal<number>}
export interface DeblurResult {readonly kind:'native-deblur-result';readonly version:1;readonly image:GpuPixelImage;readonly kernel:BlurKernel}
export interface ShakeOptions extends Output {patchSize?:number;searchRadius?:number;sensitivity?:Signal<number>;strength?:Signal<number>}
export interface GrainProfile {readonly kind:'native-grain-profile';readonly version:1;readonly radius:number;readonly spectrum:GpuDataBuffer;readonly covariance:GpuDataBuffer;readonly scale:GpuDataBuffer;readonly luminance:GpuDataBuffer;readonly diagnostics:GpuDataBuffer}
export interface GrainOptions extends FieldOutput {radius?:number;preblurSigma?:Signal<number>;lumaBins?:number}
export interface GrainSynthesis extends Output {seed?:number;animated?:boolean;strength?:Signal<number>;size?:Signal<number>;temporalRate?:Signal<number>}
export interface GrainMatch extends GrainOptions,GrainSynthesis {removeSource?:Signal<number>}
export interface SpectrumView extends Output {channel?:'red'|'green'|'blue'|'luma';exposure?:Signal<number>}
export interface Upscale extends Output {width:number;height:number;detail?:Signal<number>;noise?:Signal<number>;antiRinging?:Signal<number>}
export interface TimedImage {readonly time:Rational;readonly image:GpuPixelImage}
export interface SequenceOptions extends StabilizeOptions {time:Rational;windowSeconds?:Signal<number>;maximumGapSeconds?:Signal<number>}
export interface AutoColour extends FlowOptions,Output {strength?:Signal<number>;minimumConfidence?:Signal<number>;regularization?:Signal<number>}
export interface NativeEstimationFilters {
 opticalFlow(image:GpuPixelImage,reference:GpuPixelImage,options?:FlowOptions):Promise<MotionField>;
 bidirectionalFlow(image:GpuPixelImage,reference:GpuPixelImage,options?:FlowOptions&ConsistencyOptions):Promise<{forward:MotionField;backward:MotionField}>;
 motionConsistency(forward:MotionField,backward:MotionField,options?:ConsistencyOptions):Promise<MotionField>;
 warpByFlow(image:GpuPixelImage,motion:MotionField,options?:FlowWarpOptions):Promise<GpuPixelImage>;
 motionVisualize(image:GpuPixelImage,motion:MotionField,options?:MotionViewOptions):Promise<GpuPixelImage>;
 globalTranslation(motion:MotionField,options?:FitOptions):Promise<MotionModel>;
 globalSimilarity(motion:MotionField,options?:FitOptions):Promise<MotionModel>;
 globalAffine(motion:MotionField,options?:FitOptions):Promise<MotionModel>;
 globalHomography(motion:MotionField,options?:FitOptions):Promise<MotionModel>;
 warpByMotion(image:GpuPixelImage,motion:MotionModel,options?:MotionWarpOptions):Promise<GpuPixelImage>;
 stabilize(image:GpuPixelImage,reference:GpuPixelImage,options?:StabilizeOptions):Promise<GpuPixelImage>;
 estimateRollingShutter(motion:MotionField,options?:RollingOptions):Promise<RollingModel>;
 repairRollingShutter(image:GpuPixelImage,reference:GpuPixelImage,options?:RollingRepairOptions):Promise<GpuPixelImage>;
 estimateBlurKernel(image:GpuPixelImage,options?:KernelOptions):Promise<BlurKernel>;
 blindDeblur(image:GpuPixelImage,options?:DeblurOptions):Promise<DeblurResult>;
 cameraShakeDeblur(image:GpuPixelImage,neighbors:readonly GpuPixelImage[],options?:ShakeOptions):Promise<GpuPixelImage>;
 grainProfile(image:GpuPixelImage,options?:GrainOptions):Promise<GrainProfile>;
 synthesizeGrain(image:GpuPixelImage,profile:GrainProfile,options?:GrainSynthesis):Promise<GpuPixelImage>;
 spectralMatchGrain(image:GpuPixelImage,reference:GpuPixelImage,options?:GrainMatch):Promise<GpuPixelImage>;
 grainSpectrumView(image:GpuPixelImage,profile:GrainProfile,options?:SpectrumView):Promise<GpuPixelImage>;
 adaptiveDetailUpscale(image:GpuPixelImage,options:Upscale):Promise<GpuPixelImage>;
 stabilizeSequence(image:GpuPixelImage,samples:readonly TimedImage[],options:SequenceOptions):Promise<GpuPixelImage>;
 autoColorStabilize(image:GpuPixelImage,reference:GpuPixelImage,options?:AutoColour):Promise<GpuPixelImage>;
}
/** Design list only. No method is declared runtime-qualified by its presence. */
export const plannedEstimationNames=['opticalFlow','bidirectionalFlow','motionConsistency','warpByFlow','motionVisualize','globalTranslation','globalSimilarity','globalAffine','globalHomography','warpByMotion','stabilize','estimateRollingShutter','repairRollingShutter','estimateBlurKernel','blindDeblur','cameraShakeDeblur','grainProfile','synthesizeGrain','spectralMatchGrain','grainSpectrumView','adaptiveDetailUpscale','stabilizeSequence','autoColorStabilize'] as const satisfies readonly (keyof NativeEstimationFilters)[];
