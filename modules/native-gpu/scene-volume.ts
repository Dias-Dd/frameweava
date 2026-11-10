import {sceneVolumeLayout,densityTransport,emissiveDensityTransport,type SceneDensityGrid} from './scene-volume-grid.ts';
import {emissionSourceTransport} from './scene-volume-emission.ts';
export type {SceneDensityGrid} from './scene-volume-grid.ts';
import type {SceneRgb} from './scene.ts';

/** A bounded participating medium in world-space meters. */
export interface SceneVolume {
  bounds: {min: SceneRgb; max: SceneRgb};
  /** Extinction (absorption + scattering) per meter. */
  extinction: number;
  /** Scattering albedo. Zero is pure absorption. */
  albedo: SceneRgb;
  /** Henyey–Greenstein mean cosine. Zero is isotropic. */
  anisotropy?: number;
  density?:SceneDensityGrid;
  /** Independent isotropic emission source. Missing means exactly zero. */
  emission?:SceneVolumeEmission;
}

export interface SceneVolumeEmission {
  /** Scene-linear Rec.709 radiance added per world meter, not surface radiance
   * or sigma_a*Le. HDR values are allowed; extinction may be exactly zero. */
  coefficient:SceneRgb;
  /** Independent dimensionless emission multiplier; missing means one.
   * It is not implicitly multiplied by the volume's extinction density. */
  density?:SceneDensityGrid;
  /** Stratified samples per intersected gridded-emission segment. Default 8;
   * positive u32 count, subject to caller execution/device limits. Homogeneous
   * emission uses an exact segment integral and does not need these samples. */
  samples?:number;
}

export function sceneVolumeWords(volumes: readonly SceneVolume[] = []) {
  return sceneVolumeLayout(volumes).words;
}

const transport = (fields:string) => /* wgsl */ `
${fields}
fn mediumInterval(id: u32, origin: vec3f, direction: vec3f, limit: f32) -> vec2f {
  let m = mediumRecord(id);
  let lower = vec3f(load13(m), load13(m + 1u), load13(m + 2u));
  let upper = vec3f(load13(m + 4u), load13(m + 5u), load13(m + 6u));
  var near = 0.;
  var far = limit;
  for (var axis = 0u; axis < 3u; axis++) {
    if (direction[axis] == 0.) {
      if (origin[axis] < lower[axis] || origin[axis] > upper[axis]) { return vec2f(0.); }
      continue;
    }
    let a = (lower[axis] - origin[axis]) / direction[axis];
    let b = (upper[axis] - origin[axis]) / direction[axis];
    near = max(near, min(a, b));
    far = min(far, max(a, b));
    if (far <= near) { return vec2f(0.); }
  }
  return vec2f(near, far);
}
fn mediumBeam(origin: vec3f, direction: vec3f, limit: f32, seed:u32) -> f32 {
  var opticalDepth=0.;var transmission=1.;
  for(var id=0u;id<paramU32(22u);id++) {
    let interval=mediumInterval(id,origin,direction,limit);
    if(interval.y<=interval.x){continue;}
    let m=mediumRecord(id);
    if(mediumGrid(id)==0u){opticalDepth+=load13(m+3u)*(interval.y-interval.x);continue;}
    let majorant=mediumMajorant(id);if(majorant==0.){continue;}
    let stream=hashScene(seed^hashScene(id+0x632be59bu));
    var travel=0.;var counter=0u;
    loop {
      let step=mediumFlight(mediumRandom(stream,counter),majorant);counter++;
      let next=travel+step;
      if(next==travel&&step>0.){return -1.;}
      travel=next;if(travel>=interval.y-interval.x){break;}
      let density=mediumDensity(id,origin+direction*(interval.x+travel));
      let maximum=load13(m+15u);
      if(!(density>=0.&&density-maximum<=maximum*.000003)){return -1.;}
      transmission*=1.-clamp(density/maximum,0.,1.);
      if(transmission==0.){return 0.;}
    }
  }
  return exp(-opticalDepth)*transmission;
}
struct MediumEvent { distance: f32, id: u32 }
fn sampleMedium(origin: vec3f, direction: vec3f, limit: f32, seed: u32) -> MediumEvent {
  var result=MediumEvent(limit,0xffffffffu);
  // Independent free flights superpose in overlapping homogeneous/grid media.
  for(var id=0u;id<paramU32(22u);id++) {
    let sigma=mediumMajorant(id);if(sigma==0.){continue;}
    let interval=mediumInterval(id,origin,direction,result.distance);
    if(interval.y<=interval.x){continue;}
    var random=sceneUnit(hashScene(id^0x9e3744b9u)^seed);
    var travel=0.;var counter=0u;
    loop {
      let step=mediumFlight(random,sigma);let next=travel+step;
      if(next==travel&&step>0.){return MediumEvent(interval.x+travel,0xfffffffeu);}
      travel=next;if(travel>=interval.y-interval.x){break;}
      let at=interval.x+travel;
      if(mediumGrid(id)==0u){result=MediumEvent(at,id);break;}
      let maximum=load13(mediumRecord(id)+15u);
      let density=mediumDensity(id,origin+direction*at);
      if(!(density>=0.&&density-maximum<=maximum*.000003)){return MediumEvent(at,0xfffffffeu);}
      if(mediumRandom(seed^hashScene(id)^0x2d6f29a5u,counter)<clamp(density/maximum,0.,1.)) {
        result=MediumEvent(at,id);break;
      }
      counter++;random=mediumRandom(seed^hashScene(id)^0x98a23b17u,counter);
    }
  }
  return result;
}
fn phaseHg(cosTheta: f32, g: f32) -> f32 {
  let k = max(1e-12, 1. + g * g - 2. * g * cosTheta);
  return (1. - g * g) / (4. * pi * k * sqrt(k));
}
fn sampleHg(u: f32, g: f32) -> f32 {
  if (abs(g) < .01) {
    // Algebraically equivalent inverse CDF without subtracting two nearly equal values.
    let x = 2. * u - 1.;
    let d = 1. + g * x;
    let numerator = x + .5 * g * (3. + x * x) + g * g * x + .5 * g * g * g * (x * x - 1.);
    return clamp(numerator / (d * d), -1., 1.);
  }
  let q = (1. - g * g) / (1. - g + 2. * g * u);
  return clamp((1. + g * g - q * q) / (2. * g), -1., 1.);
}
`;

// Keep the legacy shader source and 16-word records byte-identical when no
// emission is declared. The extended private table/shader travel together.
export const volumeTransport=transport(densityTransport);
export const emissiveVolumeTransport=transport(emissiveDensityTransport)+emissionSourceTransport;
