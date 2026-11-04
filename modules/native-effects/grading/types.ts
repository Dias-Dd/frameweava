import type {Signal} from '../../../src/core/types.ts';
import type {ColorEncoding} from '../../../src/media/surface.ts';
import type {GpuPixelImage} from '../../gpu-effects/pixel-types.ts';
export type Triple=readonly [Signal<number>,Signal<number>,Signal<number>];
export type Curve=readonly (readonly [number,number])[];
export type LutEncoding='linear'|'srgb'|'acescct';
export interface LutDefinition {readonly kind:'1d'|'3d';readonly size:number;readonly domainMin:readonly [number,number,number];readonly domainMax:readonly [number,number,number];readonly values:readonly number[];readonly inputEncoding:LutEncoding;readonly outputEncoding:LutEncoding}
export interface GradeOutput {format?:'rgba16float'|'rgba32float';workingColor?:ColorEncoding;amount?:Signal<number>;signal?:AbortSignal}
export interface LutOptions extends GradeOutput {interpolation?:'nearest'|'linear'|'tetrahedral';domain?:'extend'|'clamp'}
export interface CdlOptions extends GradeOutput {slope?:Triple;offset?:Triple;power?:Triple;saturation?:Signal<number>;direction?:'forward'|'inverse';style?:'no-clamp'|'clamp'}
export interface WhiteBalanceOptions extends GradeOutput {sourceWhite?:readonly [number,number];targetWhite?:readonly [number,number]}
export interface LiftGammaGainOptions extends GradeOutput {lift?:Triple;gamma?:Triple;gain?:Triple}
export interface PrinterLightsOptions extends GradeOutput {points?:Triple;pointsPerStop?:Signal<number>}
export interface ContrastOptions extends GradeOutput {contrast?:Signal<number>;pivot?:Signal<number>}
export interface LogContrastOptions extends ContrastOptions {toe?:Signal<number>}
export interface CurveOptions extends GradeOutput {points:Curve}
export interface WheelsOptions extends GradeOutput {shadows?:Triple;midtones?:Triple;highlights?:Triple;white?:Signal<number>}
export interface SplitToneOptions extends GradeOutput {shadows?:Triple;highlights?:Triple;balance?:Signal<number>;width?:Signal<number>}
export interface RolloffOptions extends GradeOutput {threshold?:Signal<number>;softness?:Signal<number>}
export interface GamutOptions extends GradeOutput {threshold?:Triple;limit?:Triple;power?:Signal<number>}
export interface BleachOptions extends GradeOutput {saturation?:Signal<number>;pivot?:Signal<number>}
export interface NativeGradingFilters {
 lut1D(image:GpuPixelImage,lut:LutDefinition,options?:LutOptions):Promise<GpuPixelImage>;
 lut3D(image:GpuPixelImage,lut:LutDefinition,options?:LutOptions):Promise<GpuPixelImage>;
 cdl(image:GpuPixelImage,options?:CdlOptions):Promise<GpuPixelImage>;
 whiteBalance(image:GpuPixelImage,options?:WhiteBalanceOptions):Promise<GpuPixelImage>;
 liftGammaGain(image:GpuPixelImage,options?:LiftGammaGainOptions):Promise<GpuPixelImage>;
 printerLights(image:GpuPixelImage,options?:PrinterLightsOptions):Promise<GpuPixelImage>;
 contrastPivot(image:GpuPixelImage,options?:ContrastOptions):Promise<GpuPixelImage>;
 logContrast(image:GpuPixelImage,options?:LogContrastOptions):Promise<GpuPixelImage>;
 lumaCurve(image:GpuPixelImage,options:CurveOptions):Promise<GpuPixelImage>;
 hueVsHue(image:GpuPixelImage,options:CurveOptions):Promise<GpuPixelImage>;
 hueVsSaturation(image:GpuPixelImage,options:CurveOptions):Promise<GpuPixelImage>;
 hueVsLuminance(image:GpuPixelImage,options:CurveOptions):Promise<GpuPixelImage>;
 saturationVsSaturation(image:GpuPixelImage,options:CurveOptions):Promise<GpuPixelImage>;
 luminanceVsSaturation(image:GpuPixelImage,options:CurveOptions):Promise<GpuPixelImage>;
 saturationVsLuminance(image:GpuPixelImage,options:CurveOptions):Promise<GpuPixelImage>;
 colorWheels(image:GpuPixelImage,options?:WheelsOptions):Promise<GpuPixelImage>;
 splitTone(image:GpuPixelImage,options?:SplitToneOptions):Promise<GpuPixelImage>;
 highlightRolloff(image:GpuPixelImage,options?:RolloffOptions):Promise<GpuPixelImage>;
 shadowRolloff(image:GpuPixelImage,options?:RolloffOptions):Promise<GpuPixelImage>;
 gamutCompress(image:GpuPixelImage,options?:GamutOptions):Promise<GpuPixelImage>;
 bleachBypass(image:GpuPixelImage,options?:BleachOptions):Promise<GpuPixelImage>;
}
/** Function inventory, not an installation or runtime-verification registry. */
export const nativeGradingNames=['lut1D','lut3D','cdl','whiteBalance','liftGammaGain','printerLights','contrastPivot','logContrast','lumaCurve','hueVsHue','hueVsSaturation','hueVsLuminance','saturationVsSaturation','luminanceVsSaturation','saturationVsLuminance','colorWheels','splitTone','highlightRolloff','shadowRolloff','gamutCompress','bleachBypass'] as const satisfies readonly (keyof NativeGradingFilters)[];
