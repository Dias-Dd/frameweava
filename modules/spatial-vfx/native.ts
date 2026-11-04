import type {GpuPixelScope,GpuPixelImage} from '../gpu-effects/pixel-types.ts';
import {createGpuPixelEffects} from '../gpu-effects/pixel-effects.ts';
import {withGpuResources} from '../gpu-effects/resource-arena.ts';
import {planetAtmosphere,starfield,orbitalTrails,gravitationalLensing,voronoiCrystal,volumetricSpotlight,smokePlume,flameVolume,waterCaustics,heightFog} from './index.ts';
import type * as T from './types.ts';

/** Ordinary TS recipes. Every pass borrows the SAME Stage-local Scope. */
export interface NativeSpatialRecipeOptions extends Pick<T.SpatialVfxOptions,'format'|'time'|'seed'|'camera'|'steps'|'maxWork'|'signal'> {width:number;height:number}
type Appearance=Pick<T.SpatialVfxOptions,'color'|'exposure'|'density'|'rotation'>;
type Layer<O>=Omit<O,keyof T.SpatialVfxOptions>&Appearance&{opacity?:T.SpatialVfxOptions['opacity']};
type Planet=Omit<Layer<T.PlanetAtmosphereOptions>,'opacity'>;
type Orbit=Omit<Layer<T.OrbitalTrailsOptions>,'occluderRadius'>;
export interface OrbitalWorldOptions extends NativeSpatialRecipeOptions {planet?:Planet;stars?:false|Layer<T.StarfieldOptions>;trails?:false|Orbit;lens?:false|Layer<T.GravitationalLensingOptions>}
export interface CrystalSanctumOptions extends NativeSpatialRecipeOptions {crystal?:Layer<T.VoronoiCrystalOptions>;stars?:false|Layer<T.StarfieldOptions>;glow?:false|{radius?:number;threshold?:number;intensity?:number}}
export interface EmberPlumeOptions extends NativeSpatialRecipeOptions {smoke?:Layer<T.SmokePlumeOptions>;fire?:Layer<T.FlameVolumeOptions>;beam?:false|Layer<T.VolumetricSpotlightOptions>}
export interface CausticLagoonOptions extends NativeSpatialRecipeOptions {water?:Layer<T.WaterCausticsOptions>;fog?:false|Layer<T.HeightFogOptions>;beam?:false|Layer<T.VolumetricSpotlightOptions>}
const baseKeys=['width','height','format','time','seed','camera','steps','maxWork','signal'];
const appearance=['color','exposure','density','rotation','opacity'];
function fail(message:string):never{throw Object.assign(new Error(message),{code:'E_SPATIAL_RECIPE_PARAMETER'});}
function plain(value:unknown,keys:string[],name:string):Record<string,any>{
 if(!value||![Object.prototype,null].includes(Object.getPrototypeOf(value)))fail(name+' must be plain options');
 for(const key of Reflect.ownKeys(value)){const d=Object.getOwnPropertyDescriptor(value,key)!;if(typeof key!=='string'||!keys.includes(key)||!d.enumerable||!('value'in d))fail(name+' has unknown/accessor fields');}
 return value as Record<string,any>;
}
function base(options:NativeSpatialRecipeOptions,extra:string[],camera:T.VfxCamera):T.SpatialVfxOptions{
 const o=plain(options,[...baseKeys,...extra],'recipe');
 if(!Number.isSafeInteger(o.width)||o.width<1||!Number.isSafeInteger(o.height)||o.height<1)fail('Explicit positive integer width/height required');
 return Object.fromEntries(Object.entries({width:o.width,height:o.height,camera:o.camera??camera,format:o.format??'rgba32float',time:o.time,seed:o.seed,steps:o.steps,maxWork:o.maxWork,signal:o.signal}).filter(([,v])=>v!==undefined));
}
function layer(value:unknown,extra:string[],defaults:Record<string,unknown>={},opaque=false){
 return {...defaults,...plain(value??{},[...appearance.filter(k=>!opaque||k!=='opacity'),...extra],'layer')};
}
const orbitCamera:T.VfxCamera={position:[3,1.6,4.5],target:[0,0,0],verticalFov:40,near:.01,far:18};
const plumeCamera:T.VfxCamera={position:[3,1,4.5],target:[0,0,0],verticalFov:48,near:.01,far:18};

/** Planet disc and trails share an analytic opaque sphere occluder. Stars are
 * a background plate, not a second scene geometry system. Lens is applied last. */
export async function orbitalWorld(g:GpuPixelScope,c:T.SpatialVfxContext,o:OrbitalWorldOptions):Promise<GpuPixelImage>{
 const p=base(o,['planet','stars','trails','lens'],orbitCamera),planet=layer(o.planet,['planetRadius','thickness','anisotropy','scaleHeight','sunStrength'],{planetRadius:.7,thickness:.18},true);
 const stars=o.stars===false?false:layer(o.stars,['cellScale','starRadius','starDensity'],{starRadius:.045,starDensity:.5});
 const trails=o.trails===false?false:layer(o.trails,['orbits','eccentricity','period','trailDuration','radius'],{orbits:8,eccentricity:.12,radius:.009,exposure:2});
 const lens=o.lens===undefined||o.lens===false?false:layer(o.lens,['center','einsteinRadius','occluderRadius']);
 return withGpuResources(g,async a=>{
  const fx=createGpuPixelEffects(g);let image=a.image(await planetAtmosphere(g,c,{...p,...planet}));
  if(stars){const sky=a.image(await starfield(g,c,{...p,...stars}));image=a.image(await fx.over(image,sky,{format:p.format,signal:p.signal}));}
  if(trails){const ink=a.image(await orbitalTrails(g,c,{...p,...trails,occluderRadius:planet.planetRadius as number}));image=a.image(await fx.over(ink,image,{format:p.format,signal:p.signal}));}
  if(lens)image=a.image(await gravitationalLensing(g,image,c,{...p,...lens}));
  return a.keep(image);
 });
}

/** Solid crystal + HDR bloom over stars. Bloom is confined to the opaque SDF
 * layer; the shipped canonical Glow never processes tiny volume/star Alpha. */
export async function crystalSanctum(g:GpuPixelScope,c:T.SpatialVfxContext,o:CrystalSanctumOptions):Promise<GpuPixelImage>{
 const p=base(o,['crystal','stars','glow'],orbitCamera),crystal=layer(o.crystal,['facets'],{facets:24,color:[.2,.6,1],exposure:2});
 const stars=o.stars===false?false:layer(o.stars,['cellScale','starRadius','starDensity']);
 const glow=o.glow===false?false:{radius:3,threshold:.5,intensity:.7,...plain(o.glow??{},['radius','threshold','intensity'],'glow')};
 // Canonical Glow's numeric profile excludes tiny nonzero Alpha. Solids are
 // either uncovered or opaque; callers wanting translucent crystal omit Glow.
 if(glow&&crystal.opacity!==undefined)fail('Glow requires the solid crystal opacity default; use glow:false for translucent ink');
 return withGpuResources(g,async a=>{
  const fx=createGpuPixelEffects(g);let image=a.image(await voronoiCrystal(g,c,{...p,...crystal}));
  if(glow)image=a.image(await fx.glow(image,{...glow,format:p.format,signal:p.signal}));
  if(stars){const sky=a.image(await starfield(g,c,{...p,...stars}));image=a.image(await fx.over(image,sky,{format:p.format,signal:p.signal}));}
  return a.keep(image);
 });
}

/** Stylized plume plates in explicit beam -> smoke -> fire order. This is
 * layered Beer-Lambert ray marching, NOT a coupled fluid or deep compositor. */
export async function emberPlume(g:GpuPixelScope,c:T.SpatialVfxContext,o:EmberPlumeOptions):Promise<GpuPixelImage>{
 const p=base(o,['smoke','fire','beam'],plumeCamera),smoke=layer(o.smoke,['plumeRadius','frequency','octaves'],{color:[.18,.24,.3],density:1.1,rotation:0}),fire=layer(o.fire,['plumeRadius','frequency','octaves','heat'],{plumeRadius:.45,density:2,heat:5,rotation:0});
 const beam=o.beam===false?false:layer(o.beam,['length','angle','anisotropy'],{density:.3,color:[.15,.4,1],rotation:0});
 return withGpuResources(g,async a=>{
  const fx=createGpuPixelEffects(g);let image=a.image(await smokePlume(g,c,{...p,...smoke}));
  if(beam){const light=a.image(await volumetricSpotlight(g,c,{...p,...beam}));image=a.image(await fx.over(image,light,{format:p.format,signal:p.signal}));}
  const fireImage=a.image(await flameVolume(g,c,{...p,...fire}));image=a.image(await fx.over(fireImage,image,{format:p.format,signal:p.signal}));
  return a.keep(image);
 });
}

/** Animated caustics + authored optical-distance fog + volume light. Fog here
 * uses an explicit distance, not an imported scene depth or underwater solver. */
export async function causticLagoon(g:GpuPixelScope,c:T.SpatialVfxContext,o:CausticLagoonOptions):Promise<GpuPixelImage>{
 const p=base(o,['water','fog','beam'],plumeCamera),water=layer(o.water,['frequency','choppiness','focus'],{color:[.04,.4,.65],exposure:1.5,focus:.1});
 const fog=o.fog===false?false:layer(o.fog,['distance','falloff','baseHeight'],{color:[.03,.15,.22],density:.25,distance:5,falloff:.4});
 const beam=o.beam===false?false:layer(o.beam,['length','angle','anisotropy'],{color:[.15,.5,1],density:.2,rotation:0});
 return withGpuResources(g,async a=>{
  let image=a.image(await waterCaustics(g,c,{...p,...water}));
  if(fog)image=a.image(await heightFog(g,image,c,{...p,...fog}));
  if(beam){const light=a.image(await volumetricSpotlight(g,c,{...p,...beam}));image=a.image(await createGpuPixelEffects(g).over(light,image,{format:p.format,signal:p.signal}));}
  return a.keep(image);
 });
}
