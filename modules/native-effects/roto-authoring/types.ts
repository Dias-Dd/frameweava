import type {Signal} from '../../../src/core/types.ts';
import type {GpuPixelImage} from '../../gpu-effects/pixel-types.ts';
import type {GpuDataBuffer} from '../../gpu-effects/compute-types.ts';
import type {PathData} from '../../graphics-contracts/types.ts';
import type {ClosureOutput} from '../closure-filters/types.ts';
import type {MotionField,FlowOptions} from '../image-estimation/types.ts';
export type Output=ClosureOutput;
export type XY=readonly[Signal<number>,Signal<number>];
export type RGB=readonly[Signal<number>,Signal<number>,Signal<number>];
export interface StrokePoint {id:string;position:XY;pressure?:Signal<number>}
export interface BrushStroke {id:string;points:readonly StrokePoint[]}
export interface Brush extends Output {
 radius?:Signal<number>;spacing?:Signal<number>;hardness?:Signal<number>;
 roundness?:Signal<number>;angle?:Signal<number>;flow?:Signal<number>;
 opacity?:Signal<number>;color?:RGB;start?:Signal<number>;end?:Signal<number>;
 sizePressure?:boolean;opacityPressure?:boolean;flowPressure?:boolean;minimumSize?:Signal<number>;
 stencil?:GpuPixelImage;
}
export interface Airbrush extends Brush {exposure?:Signal<number>}
export interface Bristle extends Brush {fibres?:number;spread?:Signal<number>}
export interface DryBrush extends Brush {seed?:number;roughness?:Signal<number>;grainSize?:Signal<number>}
export interface Scatter extends Brush {seed?:number;scatter?:Signal<number>;rotationJitter?:Signal<number>;sizeJitter?:Signal<number>}
export interface Clone extends Brush {offset?:XY}
export interface Heal extends Clone {sigma?:Signal<number>;strength?:Signal<number>}
export interface Smudge extends Brush {strength?:Signal<number>}
export interface WetMix extends Smudge {wetness?:Signal<number>;pickup?:Signal<number>}
export interface Erase extends Brush {eraseEmission?:boolean}
export interface DodgeBurn extends Brush {exposure?:Signal<number>}
export interface PaintHeight {readonly kind:'native-paint-height';readonly version:1;readonly width:number;readonly height:number;readonly buffer:GpuDataBuffer}
export interface Height extends Omit<Brush,'format'|'amount'|'stencil'> {height?:Signal<number>}
export interface Relief extends Output {light?:readonly[Signal<number>,Signal<number>,Signal<number>];depth?:Signal<number>;ambient?:Signal<number>;diffuse?:Signal<number>;specular?:Signal<number>;roughness?:Signal<number>;color?:RGB}
export interface Contours {
 readonly kind:'native-contours';readonly version:1;readonly width:number;readonly height:number;
 /** Two candidate line segments per padded cell. CPU geometry materialization is explicit. */
 readonly cellsWidth:number;readonly cellsHeight:number;readonly vertices:GpuDataBuffer;readonly edges:GpuDataBuffer;readonly valid:GpuDataBuffer;
}
export interface Trace extends Pick<Output,'workingColor'|'signal'> {threshold?:Signal<number>;channel?:'alpha'|'luma'}
export interface ContourStroke extends Output {width?:Signal<number>;feather?:Signal<number>;color?:RGB;opacity?:Signal<number>}
export interface Scribble extends Output {angle?:Signal<number>;spacing?:Signal<number>;width?:Signal<number>;wiggle?:Signal<number>;frequency?:Signal<number>;phase?:Signal<number>;threshold?:Signal<number>;color?:RGB;opacity?:Signal<number>}
export interface Prompt {id:string;position:XY;label:'foreground'|'background'}
export interface RotoResult {
 readonly kind:'native-roto-result';readonly version:1;readonly id:string;readonly width:number;readonly height:number;
 readonly image:GpuPixelImage;readonly mask:GpuDataBuffer;readonly scores:GpuDataBuffer;readonly logits:GpuDataBuffer;readonly diagnostics:GpuDataBuffer;
}
export interface Segment extends Output {id:string;threshold?:Signal<number>;softness?:Signal<number>;candidate?:'best'|0|1|2;minimumScore?:Signal<number>;analysisBackground?:RGB;missing?:'transparent'|'retain'}
export interface Propagate extends Segment {flow?:MotionField;flowOptions?:FlowOptions;minimumConfidence?:Signal<number>;colourTolerance?:Signal<number>}
export interface RotoRefine extends Output {radius?:number;epsilon?:Signal<number>;strength?:Signal<number>;choke?:Signal<number>;feather?:Signal<number>}
export interface RotoOverlay extends Output {width?:Signal<number>;opacity?:Signal<number>;inside?:RGB;outside?:RGB;uncertain?:RGB}
export interface NativePaintFilters {
 paintStroke(image:GpuPixelImage,stroke:BrushStroke,options?:Brush):Promise<GpuPixelImage>;
 airbrushStroke(image:GpuPixelImage,stroke:BrushStroke,options?:Airbrush):Promise<GpuPixelImage>;
 bristleStroke(image:GpuPixelImage,stroke:BrushStroke,options?:Bristle):Promise<GpuPixelImage>;
 dryBrushStroke(image:GpuPixelImage,stroke:BrushStroke,options?:DryBrush):Promise<GpuPixelImage>;
 scatterStroke(image:GpuPixelImage,stroke:BrushStroke,options?:Scatter):Promise<GpuPixelImage>;
 cloneStroke(image:GpuPixelImage,reference:GpuPixelImage,stroke:BrushStroke,options?:Clone):Promise<GpuPixelImage>;
 healStroke(image:GpuPixelImage,reference:GpuPixelImage,stroke:BrushStroke,options?:Heal):Promise<GpuPixelImage>;
 smudgeStroke(image:GpuPixelImage,stroke:BrushStroke,options?:Smudge):Promise<GpuPixelImage>;
 wetMixStroke(image:GpuPixelImage,stroke:BrushStroke,options?:WetMix):Promise<GpuPixelImage>;
 eraseStroke(image:GpuPixelImage,stroke:BrushStroke,options?:Erase):Promise<GpuPixelImage>;
 dodgeBurnStroke(image:GpuPixelImage,stroke:BrushStroke,options?:DodgeBurn):Promise<GpuPixelImage>;
 brushHeight(image:GpuPixelImage,stroke:BrushStroke,options?:Height):Promise<PaintHeight>;
 paintRelief(image:GpuPixelImage,height:PaintHeight,options?:Relief):Promise<GpuPixelImage>;
 traceContours(image:GpuPixelImage,options?:Trace):Promise<Contours>;
 contourStroke(image:GpuPixelImage,contours:Contours,options?:ContourStroke):Promise<GpuPixelImage>;
 autoScribble(image:GpuPixelImage,mask:GpuPixelImage,options?:Scribble):Promise<GpuPixelImage>;
}
export interface NativeRotoFilters extends NativePaintFilters {
 segmentRoto(image:GpuPixelImage,prompts:readonly Prompt[],options:Segment):Promise<RotoResult>;
 propagateRoto(image:GpuPixelImage,reference:GpuPixelImage,basePrompts:readonly Prompt[],options:Propagate):Promise<RotoResult>;
 refineRoto(image:GpuPixelImage,roto:RotoResult,options?:RotoRefine):Promise<GpuPixelImage>;
 rotoEdgeOverlay(image:GpuPixelImage,roto:RotoResult,options?:RotoOverlay):Promise<GpuPixelImage>;
}
export interface ContourExport {
 version:1;id:string;width:number;height:number;cellsWidth:number;cellsHeight:number;
 vertices:Float32Array;edges:Uint32Array;valid:Uint32Array;
}
export interface ContourPaths {paths:PathData[];openChains:number;segments:number}
export const plannedAuthoringNames=['paintStroke','airbrushStroke','bristleStroke','dryBrushStroke','scatterStroke','cloneStroke','healStroke','smudgeStroke','wetMixStroke','eraseStroke','dodgeBurnStroke','brushHeight','paintRelief','traceContours','contourStroke','autoScribble','segmentRoto','propagateRoto','refineRoto','rotoEdgeOverlay'] as const satisfies readonly(keyof NativeRotoFilters)[];
