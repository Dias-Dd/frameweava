import {defineNativeStage,type NativeStageFactory} from '../native-gpu/authoring.ts';
import {EngineError} from '../../src/core/errors.ts';
import * as vfx from './index.ts';
import {causticLagoon,crystalSanctum,emberPlume,orbitalWorld} from './native.ts';
import type {GpuPixelImage,SpatialVfxOptions} from './types.ts';

const scenes={
  mandelbulb:vfx.mandelbulb,mengerSponge:vfx.mengerSponge,gyroidSurface:vfx.gyroidSurface,voronoiCrystal:vfx.voronoiCrystal,
  terrainRaymarch:vfx.terrainRaymarch,metaballVolume:vfx.metaballVolume,planetAtmosphere:vfx.planetAtmosphere,
  volumetricSpotlight:vfx.volumetricSpotlight,smokePlume:vfx.smokePlume,flameVolume:vfx.flameVolume,
  waterCaustics:vfx.waterCaustics,starfield:vfx.starfield,orbitalTrails:vfx.orbitalTrails,
  orbitalWorld,crystalSanctum,emberPlume,causticLagoon,
};
const imageEffects={heightFog:vfx.heightFog,gravitationalLensing:vfx.gravitationalLensing};
export type SpatialVfxSceneName=keyof typeof scenes;
export type SpatialVfxImageEffectName=keyof typeof imageEffects;
type ImageInputs={image:GpuPixelImage};
type StageDimensions={width?:number;height?:number};
type SceneArguments={
  [Name in SpatialVfxSceneName]:[name:Name,options?:Omit<NonNullable<Parameters<(typeof scenes)[Name]>[2]>,'width'|'height'>&StageDimensions];
}[SpatialVfxSceneName];
type ImageEffectArguments={
  [Name in SpatialVfxImageEffectName]:[name:Name,options?:Parameters<(typeof imageEffects)[Name]>[3]];
}[SpatialVfxImageEffectName];

/** Use the existing Native Stage dimensions, time and GPU owner for a spatial effect. */
export function spatialVfxStage(...args:SceneArguments):NativeStageFactory;
export function spatialVfxStage(...args:ImageEffectArguments):NativeStageFactory<ImageInputs>;
export function spatialVfxStage(name:SpatialVfxSceneName|SpatialVfxImageEffectName,options:SpatialVfxOptions={}):NativeStageFactory|NativeStageFactory<ImageInputs>{
  if(Object.hasOwn(imageEffects,name)){
    const apply=imageEffects[name as SpatialVfxImageEffectName];
    return defineNativeStage<ImageInputs>(init=>({renderAt(context,{image}){
      if(!image)throw new EngineError('E_SPATIAL_VFX_INPUT',`${name} requires an image input`,{hint:'Connect the upstream Stage surface to the image port.'});
      return apply(init.gpu,image,context,options);
    }}));
  }
  if(!Object.hasOwn(scenes,name))throw new EngineError('E_SPATIAL_VFX_OPTIONS',`Unknown spatial VFX: ${name}`);
  const generate=scenes[name as SpatialVfxSceneName];
  return defineNativeStage(init=>({renderAt(context){
    return generate(init.gpu,context,{width:init.width,height:init.height,...options});
  }}));
}
