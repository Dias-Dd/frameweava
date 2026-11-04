import type {FrameContext,Signal} from '../../src/core/types.ts';
import type {GpuPixelScope,GpuPixelImage} from '../gpu-effects/pixel-types.ts';
export type VfxVector=[Signal<number>,Signal<number>,Signal<number>];
export interface VfxCamera {position?:[number,number,number];target?:[number,number,number];up?:[number,number,number];verticalFov?:number;near?:number;far?:number}
export interface SpatialVfxOptions {
  width?:number;height?:number;format?:'rgba16float'|'rgba32float';
  color?:VfxVector;exposure?:Signal<number>;opacity?:Signal<number>;time?:Signal<number>;seed?:number;
  camera?:VfxCamera;steps?:number;epsilon?:number;rotation?:Signal<number>;density?:Signal<number>;
  /** Explicit numerical work plan, default16e9. Never reduces output resolution/steps. */
  maxWork?:number;signal?:AbortSignal;
}
export interface MandelbulbOptions extends SpatialVfxOptions {power?:number;iterations?:number}
export interface MengerSpongeOptions extends SpatialVfxOptions {levels?:number}
export interface GyroidSurfaceOptions extends SpatialVfxOptions {frequency?:number;thickness?:number}
export interface VoronoiCrystalOptions extends SpatialVfxOptions {facets?:number}
export interface TerrainRaymarchOptions extends SpatialVfxOptions {frequency?:number;amplitude?:number;octaves?:number}
export interface MetaballVolumeOptions extends SpatialVfxOptions {radius?:number;separation?:number}
export interface PlanetAtmosphereOptions extends SpatialVfxOptions {planetRadius?:number;thickness?:number;anisotropy?:number;scaleHeight?:number;sunStrength?:number}
export interface HeightFogOptions extends SpatialVfxOptions {distance?:number;falloff?:number;baseHeight?:number}
export interface VolumetricSpotlightOptions extends SpatialVfxOptions {length?:number;angle?:number;anisotropy?:number}
export interface SmokePlumeOptions extends SpatialVfxOptions {plumeRadius?:number;frequency?:number;octaves?:number}
export interface FlameVolumeOptions extends SpatialVfxOptions {plumeRadius?:number;frequency?:number;octaves?:number;heat?:number}
export interface WaterCausticsOptions extends SpatialVfxOptions {frequency?:number;choppiness?:number;focus?:number}
export interface StarfieldOptions extends SpatialVfxOptions {cellScale?:number;starRadius?:number;starDensity?:number}
export interface OrbitalTrailsOptions extends SpatialVfxOptions {orbits?:number;eccentricity?:number;period?:number;trailDuration?:number;radius?:number;/** Opaque sphere at world origin; 0 preserves the original unoccluded algorithm. */occluderRadius?:number}
export interface GravitationalLensingOptions extends SpatialVfxOptions {center?:[number,number];einsteinRadius?:number;occluderRadius?:number}
export type SpatialVfxContext=FrameContext;
export type {GpuPixelScope,GpuPixelImage};
