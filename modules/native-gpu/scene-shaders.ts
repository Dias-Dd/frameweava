import {sceneTextureSampling} from './scene-textures.ts';
import {sceneShading} from './scene-shading.ts';
import {sceneBrdf} from './scene-brdf.ts';

export const sceneRandom = /* wgsl */ `
fn hashScene(value: u32) -> u32 {
  var n = value;
  n = (n ^ (n >> 16u)) * 0x7feb352du;
  n = (n ^ (n >> 15u)) * 0x846ca68bu;
  return n ^ (n >> 16u);
}
fn sceneUnit(value: u32) -> f32 { return f32(hashScene(value) >> 8u) * (1. / 16777216.); }
`;

function cameraRayShader(lens = false) { return /* wgsl */ `
${sceneRandom}
fn compute(p: vec3u, local: vec3u, group: vec3u) {
  let w = paramU32(21u);
  let pixel = p.y * w + p.x;
  let seed = paramU32(23u);
  var jitter = vec2f(.5);
  if (seed != 0u) {
    let rng = hashScene(pixel ^ seed);
    jitter = vec2f(sceneUnit(rng), sceneUnit(rng ^ 0x67c9a527u));
  }
  let xy = (vec2f(p.xy) + jitter) / vec2f(f32(w), f32(paramU32(22u)));
  let x = vec3f(paramF32(0u), paramF32(1u), paramF32(2u));
  let y = vec3f(paramF32(4u), paramF32(5u), paramF32(6u));
  let z = -vec3f(paramF32(8u), paramF32(9u), paramF32(10u));
  let plane = x * (2. * xy.x - 1.) * paramF32(16u) + y * (1. - 2. * xy.y) * paramF32(17u);
  var o = vec3f(paramF32(12u), paramF32(13u), paramF32(14u));
  var d = z;
  if (paramU32(20u) != 0u) { d = normalize(z + plane); } else { o += plane; }
  ${lens ? `// Guides (seed zero) remain center-primary pinhole samples. Beauty uses a
  // uniform circular pupil and focuses on a camera-forward plane, in meters.
  if (seed != 0u && paramF32(24u) > 0. && paramU32(20u) != 0u) {
    let lensSeed = hashScene(pixel ^ seed ^ 0xa511e9b3u);
    let radius = paramF32(24u) * sqrt(sceneUnit(lensSeed));
    let angle = 6.283185307179586 * sceneUnit(lensSeed ^ 0x63d83595u);
    let focus = o + d * (paramF32(25u) / dot(d, z));
    o += radius * (cos(angle) * x + sin(angle) * y);
    d = normalize(focus - o);
  }` : ''}
  o += d * (paramF32(18u) / dot(d, z));
  let i = pixel * 3u;
  store0(i, o.x); store0(i + 1u, o.y); store0(i + 2u, o.z);
  store1(i, d.x); store1(i + 1u, d.y); store1(i + 2u, d.z);
}
`; }

export const cameraRays = cameraRayShader();
export const thinLensCameraRays = cameraRayShader(true);

export const sceneLighting = /* wgsl */ `
fn sceneSky(d: vec3f) -> vec3f {
  let lower = vec3f(paramF32(0u), paramF32(1u), paramF32(2u));
  let upper = vec3f(paramF32(3u), paramF32(4u), paramF32(5u));
  return mix(lower, upper, clamp(.5 + .5 * d.y, 0., 1.));
}
fn sunDirection() -> vec3f { return vec3f(paramF32(6u), paramF32(7u), paramF32(8u)); }
fn sunRadiance() -> vec3f { return vec3f(paramF32(9u), paramF32(10u), paramF32(11u)); }
`;

export function directSceneSurface(storage:'f32'|'u32'='f32') {return /* wgsl */ `
${sceneLighting}
${sceneTextureSampling('data5','data6',storage)}
${sceneShading('data5','data7')}
${sceneBrdf}
fn environmentRadiance(d:vec3f)->vec3f {
  if(paramU32(16u)==0u){return sceneSky(d);}
  let n=d/max(length(d),1e-20);
  let uv=vec2f(fract(atan2(n.z,n.x)/(2.*pi)+.5),acos(clamp(n.y,-1.,1.))/pi);
  return sceneTexture(paramU32(16u),uv).rgb;
}
fn pixel(p: vec2u) -> vec4f {
  let index = p.y * outputSize().x + p.x;
  let i = index * 4u;
  let r = index * 3u;
  let d = vec3f(data3(r), data3(r + 1u), data3(r + 2u));
  let forward = vec3f(paramF32(12u), paramF32(13u), paramF32(14u));
  if (data0(i) == 0u || data1(i) * dot(d, forward) > paramF32(15u)) { return vec4f(environmentRadiance(d), 1.); }
  let id = data0(i + 1u);
  let m = id * 8u;
  let maps = shadingMeta(id);
  let uvBase = data5(maps);
  let bary = vec2f(data1(i + 1u), data1(i + 2u));
  var uv = vec2f(0.);
  if (uvBase != 0u) { uv = sceneUV(data0(i + 2u), uvBase, bary); }
  let value = vec3f(data4(m), data4(m + 1u), data4(m + 2u)) * sceneTexture(data5(maps + 1u), uv).rgb*sceneVertexColor(id,data0(i+2u),bary).rgb;
  let kind = u32(data4(m + 3u));
  let occlusion=sceneOcclusion(id,data0(i+2u),bary,uv);
  if (kind == 3u || kind == 5u) { return vec4f(value, 1.); }
  let outward = vec3f(data2(i), data2(i + 1u), data2(i + 2u));
  let geometric = select(-outward, outward, data2(i + 3u) == 1.);
  let mapped = sceneNormal(id,data0(i+2u),bary,uv,geometric);
  let n = select(geometric,mapped,dot(mapped,d)<0.);
  if (kind == 2u) {
    let ior = data4(m + 4u);
    let eta = select(ior, 1. / ior, data2(i + 3u) == 1.);
    let roughness=clamp(data4(m+5u)*sceneTextureAt(data5(maps+2u),data0(i+2u),bary,uv).g,0.,1.);
    let reflected = environmentRadiance(mix(reflect(d,n),n,roughness*roughness));
    let t = refract(d, n, eta);
    if (all(t == vec3f(0.))) { return vec4f(reflected*occlusion, 1.); }
    let r0 = pow((1. - ior) / (1. + ior), 2.);
    let f = r0 + (1. - r0) * pow(clamp(1. + dot(d, n), 0., 1.), 5.);
    return vec4f(mix(environmentRadiance(mix(t,-n,roughness*roughness)), reflected, f)*occlusion, 1.);
  }
  if (kind == 4u) {
    let map = sceneTextureAt(data5(maps+2u),data0(i+2u),bary,uv);
    let roughness = clamp(data4(m+4u)*map.g,.025,1.);
    let metal = clamp(data4(m+5u)*map.b,0.,1.);
    let ior = data4(m+6u);
    let base = clamp(value,vec3f(0.),vec3f(1.));
    let emission=triangleVector(maps+7u)*sceneTextureAt(data5(maps+6u),data0(i+2u),bary,uv).rgb;
    let f0=pbrF0(base,metal,ior);
    let light = sunDirection();
    let transmission=data4(m+7u)*sceneTransmission(id,data0(i+2u),bary,uv);
    let direct=(1.-transmission)*diffusePbr(-d,n,light,base,metal,ior)+directMetal(-d,n,light,f0,pow(roughness,4.));
    let ambient=environmentRadiance(n)*base*(1.-metal)*(1.-f0)*.45*(1.-transmission)
      +environmentRadiance(reflect(d,n))*fresnel(f0,-dot(n,d))
      +environmentRadiance(d)*base*(1.-metal)*(1.-fresnel(vec3f(dielectricF0(ior)),-dot(n,d)))*transmission;
    return vec4f(emission+direct*sunRadiance()+ambient*occlusion,1.);
  }
  if (kind == 1u) {
    let reflected = reflect(d, n);
    let roughness = clamp(data4(m + 4u) * sceneTextureAt(data5(maps+2u),data0(i+2u),bary,uv).g, 0., 1.);
    let highlight = pow(max(0., dot(reflected, sunDirection())), mix(96., 4., roughness));
    return vec4f(value * (environmentRadiance(reflected)*occlusion + sunRadiance() * highlight), 1.);
  }
  return vec4f(value * (environmentRadiance(n) * (.45*occlusion) + sunRadiance() * max(0., dot(n, sunDirection())) / 3.14159265), 1.);
}
`;}
