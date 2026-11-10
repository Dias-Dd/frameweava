/** Shared linear-light GGX and metallic-roughness evaluation for both scene renderers. */
export const sceneBrdf = /* wgsl */ `
const pi: f32 = 3.141592653589793;
fn fresnel(f: vec3f, cosine: f32) -> vec3f {
  return f + (1. - f) * pow(1. - clamp(cosine, 0., 1.), 5.);
}
fn masking(cosine: f32, a2: f32) -> f32 {
  return 2. * cosine / max(1e-9, cosine + sqrt(a2 + (1. - a2) * cosine * cosine));
}
fn ggxDistribution(nh: f32, a2: f32) -> f32 {
  let k = max(a2, 1. - nh*nh + a2*nh*nh);
  return a2 / (pi*k*k);
}
fn microfacet(n: vec3f, u: f32, v: f32, a2: f32) -> vec3f {
  let c = sqrt((1.-u)/(1.+(a2-1.)*u));
  let s = sqrt(max(0.,1.-c*c));
  let t = normalize(cross(select(vec3f(0.,0.,1.),vec3f(1.,0.,0.),abs(n.z)>.99),n));
  let phi = 2.*pi*v;
  return normalize(c*n+s*(cos(phi)*t+sin(phi)*cross(n,t)));
}
fn directMetal(v: vec3f, n: vec3f, l: vec3f, color: vec3f, a2: f32) -> vec3f {
  let nv = dot(n,v);
  let nl = dot(n,l);
  if (nv<=0. || nl<=0.) { return vec3f(0.); }
  let h = normalize(v+l);
  let nh = clamp(dot(n,h),0.,1.);
  return fresnel(color,dot(v,h))*(ggxDistribution(nh,a2)*masking(nv,a2)*masking(nl,a2)/(4.*nv));
}
fn specularPdf(v: vec3f, n: vec3f, l: vec3f, a2: f32) -> f32 {
  if (dot(n,l)<=0. || dot(n,v)<=0.) { return 0.; }
  let h = normalize(v+l);
  let nh = clamp(dot(n,h),0.,1.);
  return ggxDistribution(nh,a2)*nh/(4.*max(1e-8,dot(v,h)));
}
fn dielectricF0(ior: f32) -> f32 {
  let r=(ior-1.)/(ior+1.);
  return r*r;
}
fn pbrF0(color: vec3f, metal: f32, ior: f32) -> vec3f {
  return mix(vec3f(dielectricF0(ior)),color,metal);
}
fn specularProbability(color: vec3f, metal: f32, ior: f32) -> f32 {
  if (metal>=1.) { return 1.; }
  let f = pbrF0(color,metal,ior);
  return clamp(max(f.x,max(f.y,f.z)),.05,.95);
}
fn diffusePbr(v: vec3f, n: vec3f, l: vec3f, color: vec3f, metal: f32, ior: f32) -> vec3f {
  let nl=max(0.,dot(n,l));
  if (nl==0. || dot(n,v)<=0.) { return vec3f(0.); }
  let f=fresnel(vec3f(dielectricF0(ior)),dot(v,normalize(v+l)));
  return color*(1.-metal)*(1.-f)*(nl/pi);
}
// KHR_materials_transmission: a thin surface, no medium stack or macro refraction.
fn thinTransmission(v:vec3f,n:vec3f,l:vec3f,color:vec3f,metal:f32,ior:f32,a2:f32)->vec3f {
  if(dot(n,l)>=0. || dot(n,v)<=0.){return vec3f(0.);}
  let mirror=reflect(l,n);
  let h=normalize(v+mirror);
  let f=fresnel(vec3f(dielectricF0(ior)),dot(v,h));
  return color*(1.-metal)*(1.-f)*directMetal(v,n,mirror,vec3f(1.),a2);
}
fn pbrReflectionProbability(color:vec3f,metal:f32,ior:f32,roughness:f32,transmission:f32,nv:f32)->f32 {
  if(transmission>0. && roughness==0.) {
    let f=fresnel(pbrF0(color,metal,ior),nv);return max(f.x,max(f.y,f.z));
  }
  return specularProbability(color,metal,ior);
}
fn dielectricFresnel(eta: f32, cosI: f32, cosT: f32) -> f32 {
  if (eta==1.) { return 0.; }
  let rs=(eta*cosI-cosT)/max(1e-8,eta*cosI+cosT);
  let rp=(cosI-eta*cosT)/max(1e-8,cosI+eta*cosT);
  return clamp(.5*(rs*rs+rp*rp),0.,1.);
}
`;
