import type {Rational,Signal} from '../../../src/core/types.ts';
import type {GpuPixelImage} from '../../gpu-effects/pixel-types.ts';
import type {GpuDataBuffer} from '../../gpu-effects/compute-types.ts';
import type {ClosureOutput} from '../closure-filters/types.ts';
export type Boundary='zero'|'clamp'|'mirror'|'wrap';
/** JSON calibration, row-major grid of row-major, centred, odd-size kernels.
 * Grid endpoints coincide with image pixel centres; a single knot is constant. */
export interface PsfGridV1 {kind:'frameweave.psf-grid';schemaVersion:1;anchor?:'output'|'input';columns:number;rows:number;kernelWidth:number;kernelHeight:number;kernels:readonly(readonly number[])[]}
export interface SpatialPsf {readonly kind:'native-spatial-psf';readonly version:1;readonly anchor:'output'|'input';readonly width:number;readonly height:number;readonly columns:number;readonly rows:number;readonly kernelWidth:number;readonly kernelHeight:number;readonly weights:GpuDataBuffer}
export interface ConvolveOptions extends ClosureOutput {boundary?:Boundary;alpha?:'filter'|'preserve-reference'}
export interface RestoreOptions extends ClosureOutput {boundary?:Boundary;iterations?:number;step?:Signal<number>;regularization?:Signal<number>;smoothness?:Signal<number>;alpha?:'restore'|'preserve-reference'}
export type JointObservation={readonly id:string;readonly time:Rational;readonly observed:false}|{readonly id:string;readonly time:Rational;readonly observed?:true;readonly alignment:'registered-reference';readonly image:GpuPixelImage;readonly psf:SpatialPsf;readonly mask?:GpuPixelImage;readonly weight?:Signal<number>};
export interface RestorationResult {readonly kind:'native-joint-restoration';readonly version:1;readonly image:GpuPixelImage;readonly iterations:number;readonly observations:number;readonly missingObservations:number;readonly normalDiagonal:GpuDataBuffer}
export interface PsfInspection {inspect?:(name:string,buffer:GpuDataBuffer)=>Promise<void>}
export interface PsfFilters {
 prepareSpatialPsf(image:GpuPixelImage,grid:PsfGridV1):Promise<SpatialPsf>;
 convolveSpatialPsf(image:GpuPixelImage,psf:SpatialPsf,options?:ConvolveOptions):Promise<GpuPixelImage>;
 spatialDeblur(image:GpuPixelImage,psf:SpatialPsf,options?:RestoreOptions):Promise<RestorationResult>;
 jointDeblur(reference:GpuPixelImage,observations:readonly JointObservation[],options?:RestoreOptions):Promise<RestorationResult>;
}
