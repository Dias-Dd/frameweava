import type {Signal} from '../../../src/core/types.ts';
import type {GpuPixelImage} from '../../gpu-effects/pixel-types.ts';
import type {PathData} from '../../graphics-contracts/types.ts';
import type {ClosureOutput} from '../closure-filters/types.ts';
export type Output=ClosureOutput;
export const stereoModes=['side-by-side','over-under','interlaced','red-green','red-blue','balanced-color-red-blue','balanced-red-green','balanced-red-blue','difference','red-cyan'] as const;
export interface StereoOptions extends Output {mode?:typeof stereoModes[number];swap?:boolean;convergence?:Signal<number>;verticalAlignment?:Signal<number>;units?:'pixels'|'percent';balance?:Signal<number>;alignmentInPairs?:boolean}
export interface ScribbleMask {path:PathData;mode?:'add'|'subtract'|'intersect'|'xor';invert?:boolean}
export const fillModes=['inside','centered-edge','inside-edge','outside-edge','left-edge','right-edge'] as const;
export interface ScribbleOptions extends Output {
 selection?:'single'|'all'|'modes';maskIndex?:number;
 fill?:typeof fillModes[number];edgeWidth?:Signal<number>;
 cap?:'round'|'butt'|'projecting';join?:'round'|'miter'|'bevel';miterLimit?:Signal<number>;
 angle?:Signal<number>;width?:Signal<number>;spacing?:Signal<number>;
 curviness?:Signal<number>;curvinessVariation?:Signal<number>;spacingVariation?:Signal<number>;
 overlap?:Signal<number>;overlapVariation?:Signal<number>;
 start?:Signal<number>;end?:Signal<number>;applyTo?:'scribble'|'mask-path';sequential?:boolean;
 wiggle?:'static'|'hold'|'smooth';wigglesPerSecond?:Signal<number>;seed?:number;
 opacity?:Signal<number>;color?:readonly[Signal<number>,Signal<number>,Signal<number>];
 composite?:'over'|'transparent'|'reveal';tolerance?:number;transform?:readonly Signal<number>[];
}
export interface NativeFinishingFilters {
 stereo(left:GpuPixelImage,right:GpuPixelImage,options?:StereoOptions):Promise<GpuPixelImage>;
 scribble(image:GpuPixelImage,masks:readonly ScribbleMask[],options?:ScribbleOptions):Promise<GpuPixelImage>;
}
export type XY=readonly[number,number];
export interface PathOutline {points:XY[];closed:boolean;edges:{a:XY;b:XY;start:number;length:number}[];length:number;fillRule:'nonzero'|'evenodd';mode:NonNullable<ScribbleMask['mode']>;invert:boolean}
export interface ScribbleControls {fill:number;edgeWidth:number;cap:number;join:number;miterLimit:number;angle:number;width:number;spacing:number;curviness:number;curvinessVariation:number;spacingVariation:number;overlap:number;overlapVariation:number;start:number;end:number;applyTo:number;sequential:boolean;wiggle:number;rate:number;seed:number;time:number;selection:number}
export interface ScribblePlan {polygons:XY[][];lines:XY[][];outlines:PathOutline[];polyWords:Float32Array;indexWords:Uint32Array;boundaryWords:Float32Array;tilesX:number;tileSize:number;boundaryEdges:number;stats:{scanlines:number;chains:number;segments:number;polygons:number;tileReferences:number}}
