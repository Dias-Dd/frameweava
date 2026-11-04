import type {Signal,Rational} from '../../../src/core/types.ts';
import type {GpuPixelImage} from '../../gpu-effects/pixel-types.ts';
import type {GpuDataBuffer} from '../../gpu-effects/compute-types.ts';
import type {ClosureOutput} from '../closure-filters/types.ts';
import type {FlowOptions,FitOptions,MotionField,MotionKind} from '../image-estimation/types.ts';
export type Observation={time:Rational;observed:false}|{time:Rational;observed?:true;image:GpuPixelImage;motionToPrevious?:MotionField;weight?:number};
export interface AnalysisOptions extends Pick<ClosureOutput,'workingColor'|'signal'> {model?:MotionKind;maximumGapSeconds?:Signal<number>;flow?:FlowOptions;fit?:FitOptions;meshColumns?:number;meshRows?:number;meshRadius?:Signal<number>;meshSampleStep?:number;meshIterations?:number;meshSmoothness?:Signal<number>;meshAnchor?:Signal<number>;meshRobustRadius?:Signal<number>}
export interface PathOptions extends Pick<ClosureOutput,'signal'> {strategy?:'smooth'|'locked';velocity?:Signal<number>;acceleration?:Signal<number>;jerk?:Signal<number>}
export interface CameraSequence {readonly kind:'native-camera-sequence';readonly version:1;readonly width:number;readonly height:number;readonly columns:number;readonly rows:number;readonly stride:number;readonly maximumGapSeconds:number;readonly times:readonly Rational[];readonly observed:readonly boolean[];readonly values:GpuDataBuffer;readonly diagnostics:GpuDataBuffer;readonly segments:GpuDataBuffer}
export interface CameraPath {readonly kind:'native-camera-path';readonly version:1;readonly sequence:CameraSequence;readonly values:GpuDataBuffer;readonly diagnostics:GpuDataBuffer}
export interface MapOptions extends Pick<ClosureOutput,'signal'> {time:Rational;mode?:'global'|'mesh';strength?:Signal<number>;iterations?:number;tolerancePixels?:Signal<number>;preserveScale?:boolean}
export interface StabilizationMap {readonly kind:'native-stabilization-map';readonly version:1;readonly width:number;readonly height:number;readonly time:Rational;readonly coordinates:GpuDataBuffer;readonly mode?:'global'|'mesh'}
export interface CropOptions extends Pick<ClosureOutput,'signal'> {maxZoom?:Signal<number>}
export interface StabilizationCrop {readonly kind:'native-stabilization-crop';readonly version:1;readonly width:number;readonly height:number;readonly transform:GpuDataBuffer}
export interface WarpOptions extends ClosureOutput {crop?:StabilizationCrop;cropMode?:'scale'|'mask'}
export interface FramingOptions extends MapOptions {maxZoom?:Signal<number>;strengthSamples?:number;scope?:'frame'|'sequence'}
export interface StabilizationFraming {readonly kind:'native-stabilization-framing';readonly version:1;readonly map:StabilizationMap;readonly crop:StabilizationCrop;readonly strength:GpuDataBuffer;readonly diagnostics:GpuDataBuffer;readonly strengthResolution:number;readonly sampleCount:number}
export interface SynthesisControls {inputRangeSeconds?:Signal<number>;timeSigmaSeconds?:Signal<number>;edgeFeatherPixels?:Signal<number>;edgeCrop?:readonly[Signal<number>,Signal<number>,Signal<number>,Signal<number>]}
export interface EdgeSynthesisOptions extends MapOptions,ClosureOutput,SynthesisControls {map?:StabilizationMap}
export interface StabilizedEdgeResult {readonly kind:'native-stabilized-edge-result';readonly version:1;readonly image:GpuPixelImage;readonly map:StabilizationMap;readonly coverage:GpuDataBuffer}
export interface StabilizeOptions extends AnalysisOptions,PathOptions,MapOptions,ClosureOutput {crop?:'none'|'frame'|'sequence'|'synthesize';cropMode?:'scale'|'mask';maxZoom?:Signal<number>;fitMaxZoom?:boolean;strengthSamples?:number;synthesis?:SynthesisControls}
export interface NativeStabilizationFilters {
 analyzeCameraSequence(samples:readonly Observation[],options?:AnalysisOptions):Promise<CameraSequence>;
 optimizeCameraPath(sequence:CameraSequence,options?:PathOptions):Promise<CameraPath>;
 stabilizationMap(path:CameraPath,options:MapOptions):Promise<StabilizationMap>;
 planAutoCrop(maps:readonly StabilizationMap[],options?:CropOptions):Promise<StabilizationCrop>;
 warpStabilized(image:GpuPixelImage,map:StabilizationMap,options?:WarpOptions):Promise<GpuPixelImage>;
 fitStabilizationFraming(path:CameraPath,options:FramingOptions):Promise<StabilizationFraming>;
 synthesizeStabilizedEdges(image:GpuPixelImage,path:CameraPath,options:EdgeSynthesisOptions):Promise<StabilizedEdgeResult>;
 stabilizeSequencePath(image:GpuPixelImage,samples:readonly Observation[],options:StabilizeOptions):Promise<GpuPixelImage>;
}
export interface Inspection {publish(name:string,buffer:GpuDataBuffer):Promise<void>}
