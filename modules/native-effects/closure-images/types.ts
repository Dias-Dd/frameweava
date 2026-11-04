import type {Signal} from '../../../src/core/types.ts';
import type {GpuPixelImage} from '../../gpu-effects/pixel-types.ts';
import type {GpuDataBuffer} from '../../gpu-effects/compute-types.ts';
import type {PathData} from '../../graphics-contracts/types.ts';
import type {ClosureOutput,Point,Triple} from '../closure-filters/types.ts';
export type Output=ClosureOutput;
export interface Radial extends Output{center?:Point;radius?:Signal<number>;strength?:Signal<number>}
export interface Blob extends Output{radius?:Signal<number>;strength?:Signal<number>;threshold?:Signal<number>}
export interface Flo extends Output{first?:Point;second?:Point;pull?:Point;radius?:Signal<number>;falloff?:Signal<number>}
export interface Page extends Output{fold?:Point;direction?:Signal<number>;radius?:Signal<number>;lightDirection?:Signal<number>;backOpacity?:Signal<number>;paper?:Triple}
export interface Pulse extends Radial{speed?:Signal<number>;span?:Signal<number>;wavelength?:Signal<number>}
export interface Slant extends Output{floor?:Point;slant?:Signal<number>;scale?:Point}
export interface Smear extends Output{from:Point;to:Point;reach?:Signal<number>;radius?:Signal<number>}
export interface Split extends Smear{opposite?:Signal<number>}
export interface Corners extends Output{center?:Point;gap?:Point}
export interface Reshape extends Output{destination:readonly Point[];source:readonly Point[];regularization?:number}
export interface Rolling extends Output{top?:Point;bottom?:Point;acceleration?:Point}
export interface Envelope extends Output{horizontal?:Triple;vertical?:Triple}
export interface Block extends Output{cellSize?:number;progress?:Signal<number>;seed?:number}
export interface Burn extends Output{progress?:Signal<number>;width?:Signal<number>;seed?:number;color?:Triple}
export interface Hex extends Output{radius?:Signal<number>;scale?:Signal<number>;center?:Point}
export interface SmoothPosterize extends Output{levels?:Signal<number>;softness?:Signal<number>}
export interface Rough extends Output{amplitude?:Signal<number>;feather?:Signal<number>;threshold?:Signal<number>;seed?:number}
export interface Scatter extends Output{radius?:Signal<number>;seed?:number;axis?:'both'|'horizontal'|'vertical'}
export interface Strobe extends Output{period?:number;duration?:number;phase?:number;color?:Triple}
export interface ObjectOptions extends Output{ids:readonly number[]}
export interface Seeds extends Output{foreground:readonly Point[];background:readonly Point[];tolerance?:Signal<number>}
export interface PathOptions extends Output{tolerance?:number;feather?:Signal<number>;transform?:readonly Signal<number>[]}
export interface Ellipse extends Output{center?:Point;radii?:Point;feather?:Signal<number>}
export interface Grid extends Output{cell?:Point;width?:Signal<number>;color?:Triple;background?:Triple}
export interface Beam extends Output{from:Point;to:Point;width?:Signal<number>;softness?:Signal<number>;intensity?:Signal<number>;color?:Triple}
export interface Lightning extends Beam{segments?:number;displacement?:Signal<number>;seed?:number}
export interface Threads extends Output{spacing?:Signal<number>;amplitude?:Signal<number>;wavelength?:Signal<number>;width?:Signal<number>;phase?:Signal<number>;color?:Triple;background?:Triple}
export interface Radio extends Output{center?:Point;spacing?:Signal<number>;width?:Signal<number>;phase?:Signal<number>;color?:Triple}
export interface Stroke extends PathOptions{width?:Signal<number>;start?:Signal<number>;end?:Signal<number>;dash?:Point;phase?:Signal<number>;color?:Triple}
export interface Bucket extends Output{seed:Point;tolerance?:Signal<number>;color?:Triple;opacity?:Signal<number>}
export interface Spectrum extends Output{color?:Triple;gain?:Signal<number>;gap?:Signal<number>}
export interface Waveform extends Output{color?:Triple;gain?:Signal<number>;width?:Signal<number>}
export interface Shadow extends Output{light?:Point;length?:Signal<number>;samples?:number;opacity?:Signal<number>;color?:Triple}
/** Generators receive a dimension/color/precision template. No image upload or
 * host/device choice is exposed. Typed fields never masquerade as Surfaces. */
export interface NativeClosureImageFilters{
 blobbylize(image:GpuPixelImage,height:GpuPixelImage,options?:Blob):Promise<GpuPixelImage>;
 floMotion(image:GpuPixelImage,options?:Flo):Promise<GpuPixelImage>;
 pageTurn(image:GpuPixelImage,options?:Page):Promise<GpuPixelImage>;
 ripplePulse(image:GpuPixelImage,options?:Pulse):Promise<GpuPixelImage>;
 slantWarp(image:GpuPixelImage,options?:Slant):Promise<GpuPixelImage>;
 smearWarp(image:GpuPixelImage,options:Smear):Promise<GpuPixelImage>;
 splitWarp(image:GpuPixelImage,options:Split):Promise<GpuPixelImage>;
 splitCorners(image:GpuPixelImage,options?:Corners):Promise<GpuPixelImage>;
 reshapeWarp(image:GpuPixelImage,options:Reshape):Promise<GpuPixelImage>;
 rollingShutterWarp(image:GpuPixelImage,options?:Rolling):Promise<GpuPixelImage>;
 envelopeWarp(image:GpuPixelImage,options?:Envelope):Promise<GpuPixelImage>;
 blockLoad(image:GpuPixelImage,options?:Block):Promise<GpuPixelImage>;
 burnFilm(image:GpuPixelImage,options?:Burn):Promise<GpuPixelImage>;
 hexTile(image:GpuPixelImage,options?:Hex):Promise<GpuPixelImage>;
 smoothPosterize(image:GpuPixelImage,options?:SmoothPosterize):Promise<GpuPixelImage>;
 roughenEdges(image:GpuPixelImage,options?:Rough):Promise<GpuPixelImage>;
 scatter(image:GpuPixelImage,options?:Scatter):Promise<GpuPixelImage>;
 strobe(image:GpuPixelImage,options?:Strobe):Promise<GpuPixelImage>;
 objectMatte(image:GpuPixelImage,labels:GpuDataBuffer,options:ObjectOptions):Promise<GpuPixelImage>;
 seededMatte(image:GpuPixelImage,options:Seeds):Promise<GpuPixelImage>;
 pathMatte(image:GpuPixelImage,path:PathData,options?:PathOptions):Promise<GpuPixelImage>;
 ellipseMask(template:GpuPixelImage,options?:Ellipse):Promise<GpuPixelImage>;
 gridTexture(template:GpuPixelImage,options?:Grid):Promise<GpuPixelImage>;
 beam(image:GpuPixelImage,options:Beam):Promise<GpuPixelImage>;
 lightning(image:GpuPixelImage,options:Lightning):Promise<GpuPixelImage>;
 threadsTexture(template:GpuPixelImage,options?:Threads):Promise<GpuPixelImage>;
 radioWaves(image:GpuPixelImage,options?:Radio):Promise<GpuPixelImage>;
 pathStroke(image:GpuPixelImage,path:PathData,options?:Stroke):Promise<GpuPixelImage>;
 paintBucket(image:GpuPixelImage,options:Bucket):Promise<GpuPixelImage>;
 spectrumBars(template:GpuPixelImage,spectrum:GpuDataBuffer,options?:Spectrum):Promise<GpuPixelImage>;
 waveformTrace(template:GpuPixelImage,samples:GpuDataBuffer,options?:Waveform):Promise<GpuPixelImage>;
 radialShadow(image:GpuPixelImage,options?:Shadow):Promise<GpuPixelImage>;
}
export const nativeClosureImageNames=['blobbylize','floMotion','pageTurn','ripplePulse','slantWarp','smearWarp','splitWarp','splitCorners','reshapeWarp','rollingShutterWarp','envelopeWarp','blockLoad','burnFilm','hexTile','smoothPosterize','roughenEdges','scatter','strobe','objectMatte','seededMatte','pathMatte','ellipseMask','gridTexture','beam','lightning','threadsTexture','radioWaves','pathStroke','paintBucket','spectrumBars','waveformTrace','radialShadow'] as const satisfies readonly(keyof NativeClosureImageFilters)[];
