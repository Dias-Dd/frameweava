import type {Signal} from '../../../src/core/types.ts';
import type {GpuPixelImage} from '../../gpu-effects/pixel-types.ts';
import type {ClosureOutput,Point,Triple} from '../closure-filters/types.ts';
export type FrameLayout='mono'|'side-by-side'|'top-bottom';
export type Projection='equirectangular'|'rectilinear'|'equidistant-fisheye'|'equisolid-fisheye'|'sphere-map'|'cube-3x2'|'cube-6x1'|'cube-cross';
export type BlendMode='replace'|'normal'|'add'|'multiply'|'screen'|'difference';
/** Degrees, right-handed +X right/+Y up/+Z forward. Tuple order tilt/pan/roll. */
export type Rotation=Triple;
export interface SphericalOutput extends ClosureOutput {layout?:FrameLayout;fieldOfView?:Point;boundary?:'transparent'|'clamp'}
export interface BlurOptions extends SphericalOutput {radiusDegrees?:Point;kernelSize?:number}
export interface SharpenOptions extends BlurOptions {strength?:Signal<number>;threshold?:Signal<number>}
export interface DenoiseOptions extends BlurOptions {noiseType?:'random'|'salt-pepper';noiseLevel?:Signal<number>}
export interface GlowOptions extends BlurOptions {threshold?:Signal<number>;knee?:Signal<number>;intensity?:Signal<number>;saturation?:Signal<number>}
export interface ChromaticOptions extends SphericalOutput {point?:Point;aberration?:Triple;falloffDegrees?:Signal<number>;invertFalloff?:boolean}
export interface GradientPoint {id:string;point:Point;color:Triple;weight?:Signal<number>}
export interface GradientOptions extends SphericalOutput {points:readonly GradientPoint[];power?:Signal<number>;blend?:Signal<number>;opacity?:Signal<number>;blendMode?:BlendMode}
export interface FractalOptions extends SphericalOutput {type?:'basic'|'turbulent-sharp'|'max'|'strings';complexity?:Signal<number>;scale?:Signal<number>;rotation?:Rotation;subRotation?:Rotation;subInfluence?:Signal<number>;subScaling?:Signal<number>;evolution?:Signal<number>;randomSpeed?:Signal<number>;contrast?:Signal<number>;brightness?:Signal<number>;invert?:boolean;seed?:number;low?:Triple;high?:Triple;opacity?:Signal<number>;blendMode?:BlendMode}
export interface GlitchOptions extends SphericalOutput {point?:Point;radiusDegrees?:Point;master?:Signal<number>;colorDistortion?:Triple;distortion?:Triple;complexity?:Signal<number>;rate?:Signal<number>;evolution?:Signal<number>;colorEvolution?:Signal<number>;scale?:Triple;translation?:Triple;subInfluence?:Signal<number>;subScaling?:Signal<number>;noiseStrength?:Signal<number>;noiseQuantity?:Signal<number>;noiseScale?:Signal<number>;noiseEvolution?:Signal<number>;coloredNoise?:boolean;randomSpeed?:Signal<number>;seed?:number}
export interface RotateOptions extends SphericalOutput {rotation?:Rotation}
export interface ConvertOptions extends ClosureOutput {inputProjection?:Projection;outputProjection?:Projection;inputLayout?:FrameLayout;outputLayout?:FrameLayout;inputFieldOfView?:Point;outputFieldOfView?:Point;rotation?:Rotation;width?:number;height?:number;eye?:'left'|'right';boundary?:'transparent'|'clamp'}
export interface PlaneOptions extends SphericalOutput {width?:number;height?:number;scaleDegrees?:Point;stereoDisparityDegrees?:Signal<number>;featherDegrees?:Signal<number>;sourceRotation?:Rotation;projectionRotation?:Rotation}
export interface ViewOptions extends SphericalOutput {inputProjection?:Projection;width?:number;height?:number;viewFieldOfView?:Point;rotation?:Rotation;eye?:'left'|'right'}
/** Operator work budget, independent of artistic controls and image dimensions.
 * It is adjustable; actual owner storage/texture/address limits still apply. */
export interface SphericalBudget {maxWorkPerPixel?:number}
export interface NativeSphericalFilters {
 vrBlur(image:GpuPixelImage,options?:BlurOptions):Promise<GpuPixelImage>;
 vrSharpen(image:GpuPixelImage,options?:SharpenOptions):Promise<GpuPixelImage>;
 vrDenoise(image:GpuPixelImage,options?:DenoiseOptions):Promise<GpuPixelImage>;
 vrGlow(image:GpuPixelImage,options?:GlowOptions):Promise<GpuPixelImage>;
 vrChromaticAberrations(image:GpuPixelImage,options?:ChromaticOptions):Promise<GpuPixelImage>;
 vrColorGradients(image:GpuPixelImage,options:GradientOptions):Promise<GpuPixelImage>;
 vrFractalNoise(image:GpuPixelImage,options?:FractalOptions):Promise<GpuPixelImage>;
 vrDigitalGlitch(image:GpuPixelImage,options?:GlitchOptions):Promise<GpuPixelImage>;
 vrRotateSphere(image:GpuPixelImage,options?:RotateOptions):Promise<GpuPixelImage>;
 vrConverter(image:GpuPixelImage,options?:ConvertOptions):Promise<GpuPixelImage>;
 vrPlaneToSphere(image:GpuPixelImage,options?:PlaneOptions):Promise<GpuPixelImage>;
 vrSphereToPlane(image:GpuPixelImage,options?:ViewOptions):Promise<GpuPixelImage>;
}
export const nativeSphericalNames=['vrBlur','vrSharpen','vrDenoise','vrGlow','vrChromaticAberrations','vrColorGradients','vrFractalNoise','vrDigitalGlitch','vrRotateSphere','vrConverter','vrPlaneToSphere','vrSphereToPlane'] as const satisfies readonly(keyof NativeSphericalFilters)[];
