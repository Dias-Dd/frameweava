import type {Signal} from '../../../src/core/types.ts';
import type {GpuPixelImage,GpuPixelImageInfo} from '../../gpu-effects/pixel-types.ts';

/** Physical pixels, top-left origin, y down; geometric pixel centres are x+.5. */
export type Point=readonly [Signal<number>,Signal<number>];
export type Boundary='transparent'|'clamp'|'repeat'|'mirror';
export interface GeometryOptions {
 format?:GpuPixelImageInfo['format'];
 boundary?:Boundary;
 sampling?:'bilinear'|'nearest';
 signal?:AbortSignal;
 /** Optional caller budget, in addition to the actual owner's admission. */
 maxWorkingBytes?:number;
}
export interface ResizeOptions extends Omit<GeometryOptions,'sampling'> {
 width:Signal<number>;height:Signal<number>;
 method?:'nearest'|'triangle'|'mitchell'|'lanczos3';
 antialias?:boolean;
 /** Signed reconstruction kernels may overshoot coverage; RGB remains signed HDR. */
 coverage?:'clamp';
}
export interface HomographyOptions extends GeometryOptions {
 /** Row-major output-centre -> source-centre homography. */
 matrix:readonly Signal<number>[];
 width?:Signal<number>;height?:Signal<number>;
}
export interface CornerPinOptions extends GeometryOptions {
 /** Destination TL,TR,BR,BL; source corners are the complete source rectangle. */
 corners:readonly [Point,Point,Point,Point];
 width?:Signal<number>;height?:Signal<number>;
}
export interface RadialOptions extends GeometryOptions {center?:Point;radius?:Signal<number>}
export interface TwirlOptions extends RadialOptions {angle?:Signal<number>}
export interface BulgeOptions extends GeometryOptions {center?:Point;radii?:Point;height?:Signal<number>;taper?:Signal<number>;pinEdges?:boolean}
export type WaveShape='sine'|'square'|'triangle'|'sawtooth'|'circle'|'semicircle'|'uncircle'|'noise'|'smooth-noise';
export type WavePin='none'|'all'|'center'|'left'|'top'|'right'|'bottom'|'horizontal'|'vertical';
export interface WaveOptions extends GeometryOptions {height?:Signal<number>;wavelength?:Signal<number>;direction?:Signal<number>;phase?:Signal<number>;speed?:Signal<number>;time?:Signal<number>;shape?:WaveShape;pin?:WavePin;seed?:number}
export interface RippleOptions extends RadialOptions {height?:Signal<number>;wavelength?:Signal<number>;phase?:Signal<number>;speed?:Signal<number>;time?:Signal<number>;asymmetric?:boolean}
export interface MirrorOptions extends GeometryOptions {center?:Point;angle?:Signal<number>}
export interface OffsetOptions extends GeometryOptions {offset?:Point}
export interface PolarOptions extends GeometryOptions {direction?:'rect-to-polar'|'polar-to-rect';amount?:Signal<number>}
export interface TurbulentOptions extends GeometryOptions {amount?:Signal<number>;size?:Signal<number>;offset?:Point;evolution?:Signal<number>;octaves?:number;seed?:number;falloff?:Signal<number>;kind?:'turbulent'|'bulge'|'twist'|'vertical'|'horizontal'|'cross';pin?:WavePin}
export interface OpticsOptions extends GeometryOptions {center?:Point;fieldOfView?:Signal<number>;orientation?:'horizontal'|'vertical'|'diagonal';reverse?:boolean}
export interface MagnifyOptions extends RadialOptions {magnification?:Signal<number>;feather?:Signal<number>;shape?:'circle'|'square';opacity?:Signal<number>}
export interface MeshOptions extends GeometryOptions {columns:number;rows:number;destination:readonly Point[];source?:readonly Point[];subdivisions?:number}
/** Four cubic edges in clockwise order, each including its two end vertices. */
export interface BezierOptions extends GeometryOptions {top:readonly [Point,Point,Point,Point];right:readonly [Point,Point,Point,Point];bottom:readonly [Point,Point,Point,Point];left:readonly [Point,Point,Point,Point];subdivisions?:number}
export interface BendOptions extends GeometryOptions {start?:Point;end?:Point;angle?:Signal<number>;prestart?:'static'|'transparent'}
export interface LensWarpOptions extends RadialOptions {convergence?:Signal<number>}
export interface TilerOptions extends GeometryOptions {center?:Point;scale?:Point;rotation?:Signal<number>;mirror?:boolean}
export interface GriddlerOptions extends GeometryOptions {tileSize?:Signal<number>;scale?:Point;rotation?:Signal<number>;gap?:Signal<number>}
/** Brown-Conrady inverse sampling map; coefficient signs describe output -> source. */
export interface LensDistortionOptions extends GeometryOptions {center?:Point;normalization?:Signal<number>;radial?:readonly [Signal<number>,Signal<number>,Signal<number>];tangential?:Point}
export interface LiquifyBrush {kind:'push'|'pinch'|'twirl';center:Point;radius:Signal<number>;amount:Signal<number>;offset?:Point}
export interface LiquifyOptions extends GeometryOptions {brushes:readonly LiquifyBrush[]}
export interface KaleidoscopeOptions extends GeometryOptions {center?:Point;segments?:Signal<number>;rotation?:Signal<number>}
export interface CylinderOptions extends GeometryOptions {center?:Point;radius?:Signal<number>;axis?:'horizontal'|'vertical';angle?:Signal<number>}

export interface NativeGeometryFilters {
 resample(image:GpuPixelImage,options:ResizeOptions):Promise<GpuPixelImage>;
 homographyWarp(image:GpuPixelImage,options:HomographyOptions):Promise<GpuPixelImage>;
 cornerPin(image:GpuPixelImage,options:CornerPinOptions):Promise<GpuPixelImage>;
 twirl(image:GpuPixelImage,options?:TwirlOptions):Promise<GpuPixelImage>;
 spherize(image:GpuPixelImage,options?:RadialOptions):Promise<GpuPixelImage>;
 bulge(image:GpuPixelImage,options?:BulgeOptions):Promise<GpuPixelImage>;
 waveWarp(image:GpuPixelImage,options?:WaveOptions):Promise<GpuPixelImage>;
 ripple(image:GpuPixelImage,options?:RippleOptions):Promise<GpuPixelImage>;
 mirrorWarp(image:GpuPixelImage,options?:MirrorOptions):Promise<GpuPixelImage>;
 offset(image:GpuPixelImage,options?:OffsetOptions):Promise<GpuPixelImage>;
 polarCoordinates(image:GpuPixelImage,options?:PolarOptions):Promise<GpuPixelImage>;
 turbulentDisplace(image:GpuPixelImage,options?:TurbulentOptions):Promise<GpuPixelImage>;
 opticsCompensation(image:GpuPixelImage,options?:OpticsOptions):Promise<GpuPixelImage>;
 magnify(image:GpuPixelImage,options?:MagnifyOptions):Promise<GpuPixelImage>;
 meshWarp(image:GpuPixelImage,options:MeshOptions):Promise<GpuPixelImage>;
 bezierWarp(image:GpuPixelImage,options:BezierOptions):Promise<GpuPixelImage>;
 bend(image:GpuPixelImage,options?:BendOptions):Promise<GpuPixelImage>;
 lensWarp(image:GpuPixelImage,options?:LensWarpOptions):Promise<GpuPixelImage>;
 tiler(image:GpuPixelImage,options?:TilerOptions):Promise<GpuPixelImage>;
 griddler(image:GpuPixelImage,options?:GriddlerOptions):Promise<GpuPixelImage>;
 lensDistortion(image:GpuPixelImage,options?:LensDistortionOptions):Promise<GpuPixelImage>;
 liquify(image:GpuPixelImage,options:LiquifyOptions):Promise<GpuPixelImage>;
 kaleidoscope(image:GpuPixelImage,options?:KaleidoscopeOptions):Promise<GpuPixelImage>;
 cylinderWarp(image:GpuPixelImage,options?:CylinderOptions):Promise<GpuPixelImage>;
}
export const nativeGeometryNames=['resample','homographyWarp','cornerPin','twirl','spherize','bulge','waveWarp','ripple','mirrorWarp','offset','polarCoordinates','turbulentDisplace','opticsCompensation','magnify','meshWarp','bezierWarp','bend','lensWarp','tiler','griddler','lensDistortion','liquify','kaleidoscope','cylinderWarp'] as const satisfies readonly (keyof NativeGeometryFilters)[];
