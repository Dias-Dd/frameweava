import type {Signal} from '../../../src/core/types.ts';
import type {ColorEncoding} from '../../../src/media/surface.ts';
import type {GpuPixelImage} from '../../gpu-effects/pixel-types.ts';
export type Point=readonly [Signal<number>,Signal<number>];
export type Triple=readonly [Signal<number>,Signal<number>,Signal<number>];
export interface TextureOptions {width?:number;height?:number;format?:'rgba16float'|'rgba32float';workingColor?:ColorEncoding;scale?:Point;offset?:Point;rotation?:Signal<number>;evolution?:Signal<number>;seed?:number;low?:Triple;high?:Triple;opacity?:Signal<number>;contrast?:Signal<number>;brightness?:Signal<number>;signal?:AbortSignal}
export interface FractalOptions extends TextureOptions {octaves?:number;lacunarity?:Signal<number>;gain?:Signal<number>}
export interface WarpOptions extends FractalOptions {warp?:Signal<number>}
export interface CellOptions extends TextureOptions {jitter?:Signal<number>;edgeWidth?:Signal<number>}
export interface HexOptions extends TextureOptions {groutWidth?:Signal<number>;softness?:Signal<number>}
export interface GaborOptions extends TextureOptions {frequency?:Signal<number>;bandwidth?:Signal<number>;impulses?:number}
export interface VeinOptions extends FractalOptions {frequency?:Signal<number>;warp?:Signal<number>}
export interface BrickOptions extends TextureOptions {mortar?:Signal<number>;stagger?:Signal<number>;bevel?:Signal<number>}
export interface TileOptions extends TextureOptions {lineWidth?:Signal<number>;softness?:Signal<number>}
export interface OrbitOptions extends TextureOptions {iterations?:number;bailout?:Signal<number>;constant?:Point}
export interface NativeTextureFilters {
 fractalNoise(options?:FractalOptions):Promise<GpuPixelImage>;
 turbulentNoise(options?:FractalOptions):Promise<GpuPixelImage>;
 ridgedNoise(options?:FractalOptions):Promise<GpuPixelImage>;
 curlTexture(options?:TextureOptions):Promise<GpuPixelImage>;
 domainWarpTexture(options?:WarpOptions):Promise<GpuPixelImage>;
 gaborTexture(options?:GaborOptions):Promise<GpuPixelImage>;
 cellularTexture(options?:Omit<CellOptions,'edgeWidth'>):Promise<GpuPixelImage>;
 voronoiEdges(options?:CellOptions):Promise<GpuPixelImage>;
 crackleTexture(options?:CellOptions):Promise<GpuPixelImage>;
 marbleTexture(options?:VeinOptions):Promise<GpuPixelImage>;
 woodTexture(options?:VeinOptions):Promise<GpuPixelImage>;
 graniteTexture(options?:FractalOptions):Promise<GpuPixelImage>;
 cloudsTexture(options?:FractalOptions):Promise<GpuPixelImage>;
 causticsTexture(options?:CellOptions):Promise<GpuPixelImage>;
 bricksTexture(options?:BrickOptions):Promise<GpuPixelImage>;
 hexagonTexture(options?:HexOptions):Promise<GpuPixelImage>;
 truchetTexture(options?:TileOptions):Promise<GpuPixelImage>;
 weaveTexture(options?:TileOptions):Promise<GpuPixelImage>;
 juliaTexture(options?:OrbitOptions):Promise<GpuPixelImage>;
 mandelbrotTexture(options?:Omit<OrbitOptions,'constant'>):Promise<GpuPixelImage>;
}
export const nativeTextureNames=['fractalNoise','turbulentNoise','ridgedNoise','curlTexture','domainWarpTexture','gaborTexture','cellularTexture','voronoiEdges','crackleTexture','marbleTexture','woodTexture','graniteTexture','cloudsTexture','causticsTexture','bricksTexture','hexagonTexture','truchetTexture','weaveTexture','juliaTexture','mandelbrotTexture'] as const satisfies readonly (keyof NativeTextureFilters)[];
