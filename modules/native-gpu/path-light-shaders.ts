export const emitterTransport = /* wgsl */ `
fn lightF32(i: u32) -> f32 { return bitcast<f32>(load14(i)); }
fn lightV3(i: u32) -> vec3f { return vec3f(lightF32(i), lightF32(i + 1u), lightF32(i + 2u)); }
fn emitterRecord(i: u32) -> u32 { return load14(1u) + i * 16u; }
fn hasSun() -> bool { return any(sunRadiance() > vec3f(0.)); }
fn hasEnvironment()->bool {return paramU32(26u)!=0u;}
fn lightCount()->f32 {return f32(u32(load14(0u)>0u)+u32(hasSun())+u32(hasEnvironment()));}
fn areaProbability() -> f32 {
  if(load14(0u)==0u){return 0.;}return 1./lightCount();
}
fn environmentProbability()->f32 {
  if(!hasEnvironment()){return 0.;}return 1./lightCount();
}
fn areaPdf(at: u32, direction: vec3f, distance: f32) -> f32 {
  let area = lightF32(at + 7u);
  let probability = areaProbability() * lightF32(at + 11u);
  if (area <= 0. || probability <= 0.) { return 0.; }
  let lightNormal = cross(lightV3(at + 4u), lightV3(at + 8u)) / (2. * area);
  let cosine = abs(dot(lightNormal, direction));
  if (cosine == 0.) { return 0.; }
  return probability * (distance * distance / (cosine * area));
}
fn emitterPdf(node: u32, triangle: u32, direction: vec3f, distance: f32) -> f32 {
  if (load14(0u) == 0u) { return 0.; }
  let offset = load14(2u + node);
  if (offset == 0u) { return 0.; }
  return areaPdf(emitterRecord(offset - 1u + triangle), direction, distance);
}
fn powerWeight(a: f32, b: f32) -> f32 {
  if (b <= 0.) { return 1.; }
  if (a <= 0.) { return 0.; }
  if (a >= b) { let r = b / a; return 1. / (1. + r*r); }
  let r = a / b;
  return r*r / (1. + r*r);
}
struct PathLight {
  direction: vec3f,
  radiance: vec3f,
  distance: f32,
  pdf: f32,
  delta: bool,
  ambient: bool,
}
fn sampleLight(origin: vec3f, seed: u32) -> PathLight {
  let invalid = PathLight(vec3f(0.), vec3f(0.), 0., 0., false, false);
  let choice = sceneUnit(seed ^ 0x91c4b82fu);
  let areaChance = areaProbability();
  if (choice >= areaChance) {
    let environmentChance=environmentProbability();
    if(choice<areaChance+environmentChance && hasEnvironment()) {
      let direction=sampleEnvironment(seed);
      return PathLight(direction,environmentRadiance(direction),paramF32(23u),
        environmentChance*environmentCellPdf(direction),false,true);
    }
    if (!hasSun()) { return invalid; }
    return PathLight(sunDirection(), sunRadiance(), paramF32(23u), 1./lightCount(), true,false);
  }
  let u = sceneUnit(seed ^ 0x7ad5aaf1u);
  var lo = 0u;
  var hi = load14(0u);
  while (lo < hi) {
    let mid = lo + (hi - lo) / 2u;
    if (lightF32(emitterRecord(mid) + 3u) <= u) { lo = mid + 1u; } else { hi = mid; }
  }
  if (lo >= load14(0u)) { return invalid; }
  let at = emitterRecord(lo);
  let q = sqrt(sceneUnit(seed ^ 0xbace7181u));
  let split = sceneUnit(seed ^ 0x1bb94a47u);
  let bary = vec2f(q * (1. - split), q * split);
  let offset = lightV3(at) + lightV3(at + 4u) * bary.x + lightV3(at + 8u) * bary.y - origin;
  let distance = length(offset);
  if (distance <= paramF32(20u) || distance > paramF32(23u)) { return invalid; }
  let direction = offset / distance;
  let pdf = areaPdf(at, direction, distance);
  let node = load14(at + 12u);
  let primitive = load14(at + 13u);
  let uv=pathUV(node,primitive,bary);
  let maps=shadingMeta(node);
  let mode=load11(maps+11u);
  var coverage=1.;
  if(mode!=0u) {
    let alpha=clamp(bitcast<f32>(load11(maps+10u))*sceneTexture(load11(maps+1u),uv).a*sceneVertexColor(node,primitive,bary).a,0.,1.);
    coverage=alpha;
    if(mode==1u){coverage=select(0.,1.,alpha>=bitcast<f32>(load11(maps+12u)));}
  }
  if(load11(maps+13u)!=0u && dot(cross(lightV3(at+4u),lightV3(at+8u)),direction)>=0.){return invalid;}
  var emission=pathColor(node,primitive,bary,uv);
  if(u32(load6(node*8u+3u))==4u) {
    emission=triangleVector(maps+7u)*sceneTextureAt(load11(maps+6u),primitive,bary,uv).rgb;
  }
  emission*=coverage;
  return PathLight(direction, emission, distance, pdf, false,false);
}
`;
