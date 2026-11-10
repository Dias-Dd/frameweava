import {sceneLighting, sceneRandom} from './scene-shaders.ts';
import {sceneTextureSampling} from './scene-textures.ts';
import {volumeTransport,emissiveVolumeTransport} from './scene-volume.ts';
import {environmentSampling} from './scene-environment.ts';
import {emitterTransport} from './path-light-shaders.ts';
import {sceneShading} from './scene-shading.ts';
import {sceneBrdf} from './scene-brdf.ts';

export const resetPath = /* wgsl */ `
fn compute(p: vec3u, local: vec3u, group: vec3u) {
  let stride = paramU32(1u);
  let i = (p.y * paramU32(0u) + p.x) * stride;
  store0(i, 0.); store0(i + 1u, 0.); store0(i + 2u, 0.); store0(i + 3u, 0.);
  store0(i + 4u, 1.); store0(i + 5u, 1.); store0(i + 6u, 1.); store0(i + 7u, 0.);
  for (var j = 8u; j < stride; j++) { store0(i + j, 0.); }
}
`;

export function advancePath(storage:'f32'|'u32'='f32',emissiveMedia=false) {return /* wgsl */ `
${sceneLighting}
${sceneRandom}
${sceneTextureSampling('load11','load12',storage)}
${sceneShading('load11','load15')}
${sceneBrdf}
${environmentSampling}
${emissiveMedia?emissiveVolumeTransport:volumeTransport}
${emitterTransport}
fn f0(m: u32) -> vec3f { return vec3f(load6(m), load6(m + 1u), load6(m + 2u)); }
fn pathUV(id: u32, triangle: u32, bary: vec2f) -> vec2f {
  let base = load11(shadingMeta(id));
  if (base == 0u) { return vec2f(0.); }
  return sceneUV(triangle, base, bary);
}
fn pathColor(id: u32, primitive:u32,bary:vec2f,uv: vec2f) -> vec3f {
  return f0(id * 8u) * sceneTexture(load11(shadingMeta(id)+1u), uv).rgb*sceneVertexColor(id,primitive,bary).rgb;
}
fn indexOf(id: u32) -> f32 { return load6(id * 8u + 4u); }
fn addRgb(s: u32, value: vec3f) {
  store2(s, load2(s) + value.x);
  store2(s + 1u, load2(s + 1u) + value.y);
  store2(s + 2u, load2(s + 2u) + value.z);
}
fn markPrimary(s: u32, group: u32) {
  if (paramU32(24u) == 24u && load2(s + 8u) == 0.) { store2(s + 8u, f32(group + 1u)); }
}
fn add(s: u32, value: vec3f) {
  addRgb(s, value);
  if (paramU32(24u) == 24u) {
    // Unscattered camera rays are assigned to emission, including the visible sky.
    let primary = u32(load2(s+8u));
    let group = select(3u,primary-1u,primary>0u);
    addRgb(s+9u+group*3u, value);
  }
}
fn done(r: u32, s: u32) {
  store2(s + 3u, -1.);
  store1(r, 0.); store1(r + 1u, 0.); store1(r + 2u, 0.);
}
fn continuePath(r: u32, s: u32, start: vec3f, direction: vec3f, weight: vec3f, pdf: f32) {
  let d = normalize(direction);
  store0(r, start.x); store0(r + 1u, start.y); store0(r + 2u, start.z);
  store1(r, d.x); store1(r + 1u, d.y); store1(r + 2u, d.z);
  store2(s + 4u, weight.x); store2(s + 5u, weight.y); store2(s + 6u, weight.z); store2(s + 7u, pdf);
}
fn lightMis(light: PathLight, pdf: f32) -> f32 {
  return select(powerWeight(light.pdf,pdf),1.,light.delta || paramU32(21u)==1u);
}
fn recordSplitLight(r: u32, start: vec3f, light: PathLight, diffuse: vec3f, specular: vec3f,
    diffusePdf: f32, glossyPdf: f32, split: bool) {
  let beam=mediumBeam(start,light.direction,light.distance,hashScene(r^paramU32(17u)^hashScene(paramU32(18u)+0x15ac713bu)));
  let radiance=light.radiance*(max(0.,beam)/light.pdf);
  let glossy=specular*radiance*lightMis(light,glossyPdf);
  var candidate=diffuse*radiance*lightMis(light,diffusePdf)+glossy;
  if(beam<0.){candidate=vec3f(8.,0.,8.);}
  if (!any(candidate != vec3f(0.))) { return; }
  store8(r, start.x); store8(r + 1u, start.y); store8(r + 2u, start.z);
  store9(r, light.direction.x); store9(r + 1u, light.direction.y); store9(r + 2u, light.direction.z);
  let at = (r / 3u) * 8u;
  let epsilon = max(.5 * paramF32(20u), light.distance * 3e-6);
  store10(at, candidate.x); store10(at + 1u, candidate.y); store10(at + 2u, candidate.z);
  store10(at + 3u, select(max(0., light.distance - epsilon), light.distance + epsilon, light.delta));
  store10(at+4u,glossy.x);store10(at+5u,glossy.y);store10(at+6u,glossy.z);
  store10(at+7u,select(0.,1.,split));
}
fn recordLight(r: u32, start: vec3f, light: PathLight, value: vec3f, alternatePdf: f32) {
  recordSplitLight(r,start,light,value,vec3f(0.),alternatePdf,0.,false);
}
fn hemisphere(n: vec3f, cosTheta: f32, phi: f32) -> vec3f {
  let up = select(vec3f(0., 0., 1.), vec3f(1., 0., 0.), abs(n.z) > .99);
  let x = normalize(cross(up, n));
  let y = cross(n, x);
  let sinTheta = sqrt(max(0., 1. - cosTheta * cosTheta));
  return normalize(cosTheta * n + sinTheta * (cos(phi) * x + sin(phi) * y));
}
fn dielectricReflectionPdf(v:vec3f,n:vec3f,l:vec3f,a2:f32,eta:f32) -> f32 {
  let h=normalize(v+l);
  let t=refract(-v,h,eta);
  let f=select(1.,dielectricFresnel(eta,dot(v,h),abs(dot(t,h))),any(t!=vec3f(0.)));
  return f*specularPdf(v,n,l,a2);
}
fn compute(p: vec3u, local: vec3u, group: vec3u) {
  let pixel = p.y * paramU32(16u) + p.x;
  let s = pixel * paramU32(24u);
  let r = pixel * 3u;
  let i = pixel * 4u;
  let bounce = paramU32(18u);
  let epsilon = paramF32(20u);
  let depth = load2(s + 3u);
  // A zero shadow direction makes the existing hardware query skip inactive lanes.
  store9(r, 0.); store9(r + 1u, 0.); store9(r + 2u, 0.);
  let lightOut = pixel*8u;
  store10(lightOut,0.);store10(lightOut+1u,0.);store10(lightOut+2u,0.);
  if (depth < 0.) { return; }
  let d = vec3f(load1(r), load1(r + 1u), load1(r + 2u));
  let o = vec3f(load0(r), load0(r + 1u), load0(r + 2u));
  var weight = vec3f(load2(s + 4u), load2(s + 5u), load2(s + 6u));
  let t = load4(i);
  let forward = vec3f(paramF32(12u), paramF32(13u), paramF32(14u));
  let clipped = bounce == 0u && t * dot(d, forward) > paramF32(15u);
  let surfaceHit = load3(i) != 0u && !clipped;
  var limit = paramF32(23u);
  if (bounce == 0u) { limit = min(limit, paramF32(15u) / max(1e-12, dot(d, forward))); }
  if (surfaceHit) { limit = t; }
  let seed = hashScene(pixel ^ paramU32(17u) ^ hashScene(bounce + 0x24afd875u));
  let u = sceneUnit(seed ^ 0x7bd3a19du);
  let v = sceneUnit(seed ^ 0x8fe1b19bu);
  let k = pixel * paramU32(19u);
  let stackSize = u32(depth);
  let volume = sampleMedium(o, d, limit, seed);
  if(volume.id==0xfffffffeu){add(s,vec3f(8.,0.,8.));done(r,s);return;}
  var currentIor = 1.;${emissiveMedia?`
  var solidAbsorption=vec3f(0.);
  if(stackSize>0u){solidAbsorption=f0(load7(k+stackSize-1u)*8u);}
  let emitted=mediumEmission(o,d,volume.distance,seed,solidAbsorption);
  if(any(emitted<vec3f(0.))){add(s,vec3f(8.,0.,8.));done(r,s);return;}
  add(s,weight*emitted);`:''}
  if (stackSize > 0u) {
    let medium = load7(k + stackSize - 1u);
    currentIor = indexOf(medium);
    weight *= exp(-f0(medium * 8u) * volume.distance);
  }
  if (volume.id != 0xffffffffu) {
    markPrimary(s,4u);
    let at = mediumRecord(volume.id);
    let x = o + d * volume.distance;
    let g = load13(at + 7u);
    weight *= vec3f(load13(at + 8u), load13(at + 9u), load13(at + 10u));
    let light = sampleLight(x, seed);
    if (light.pdf > 0.) {
      let phase = phaseHg(clamp(dot(d, light.direction), -1., 1.), g);
      recordLight(r, x, light, weight * phase, phase);
    }
    if (paramU32(21u) == 1u || !any(weight > vec3f(0.))) {
      done(r, s);
      return;
    }
    let cosTheta = sampleHg(u, g);
    continuePath(r, s, x, hemisphere(d, cosTheta, 2. * pi * v), weight, phaseHg(cosTheta, g));
    return;
  }
  if (!surfaceHit) {
    if (depth == 0.) {
      let priorPdf=load2(s+7u);
      var alternate=0.;
      if(hasEnvironment()){alternate=environmentProbability()*environmentCellPdf(d);}
      add(s,weight*environmentRadiance(d)*select(1.,powerWeight(priorPdf,alternate),priorPdf>0.));
    }
    done(r, s);
    return;
  }
  let id = load3(i + 1u);
  let m = id * 8u;
  let kind = u32(load6(m + 3u));
  let primitive = load3(i + 2u);
  let bary = vec2f(load4(i + 1u), load4(i + 2u));
  let uv = pathUV(id, primitive, bary);
  let tint = pathColor(id,primitive,bary,uv);
  if (kind == 3u || kind == 5u) {
    let priorPdf = load2(s + 7u);
    let mis = select(1., powerWeight(priorPdf, emitterPdf(id, primitive, d, t)), priorPdf > 0.);
    add(s, weight * tint * mis);
    done(r, s);
    return;
  }
  let x = o + d * t;
  let outward = vec3f(load5(i), load5(i + 1u), load5(i + 2u));
  let entering = load5(i + 3u) == 1.;
  let geometric = select(-outward, outward, entering);
  let mapped = sceneNormal(id,primitive,bary,uv,geometric);
  let n = select(geometric,mapped,dot(mapped,d)<0.);
  let maps=shadingMeta(id);
  let occlusion=sceneOcclusion(id,primitive,bary,uv);
  let parameters=sceneTextureAt(load11(maps+2u),primitive,bary,uv);
  let roughness=clamp(select(load6(m+4u),load6(m+5u),kind==2u)*parameters.g,0.,1.);
  let a2=pow(max(.025,roughness),4.);
  let metal=clamp(load6(m+5u)*parameters.b,0.,1.);
  let ior=load6(m+6u);
  let transmission=select(0.,load6(m+7u)*sceneTransmission(id,primitive,bary,uv),kind==4u && metal<1.);
  let transmissionRoughness=roughness*clamp(2.*ior-2.,0.,1.);
  let transmissionA2=pow(max(.025,transmissionRoughness),4.);
  let data=clamp(tint,vec3f(0.),vec3f(1.));
  var eta=1.;
  if (kind==2u) {
    var targetIor=indexOf(id);
    if (!entering) {
      if (stackSize==0u || load7(k+stackSize-1u)!=id) {
        add(s,vec3f(8.,0.,8.));done(r,s);return;
      }
      targetIor=1.;
      if (stackSize>1u) { targetIor=indexOf(load7(k+stackSize-2u)); }
    }
    eta=currentIor/targetIor;
  }
  if (kind==4u) {
    let priorPdf=load2(s+7u);
    let mis=select(1.,powerWeight(priorPdf,emitterPdf(id,primitive,d,t)),priorPdf>0.);
    add(s,weight*triangleVector(maps+7u)*sceneTextureAt(load11(maps+6u),primitive,bary,uv).rgb*mis);
  }
  if (kind<2u) { markPrimary(s,kind); }
  let continuous=kind==0u || (kind==1u && roughness>0.) || kind==4u ||
    (kind==2u && roughness>0. && eta!=1.);
  if (continuous) {
    let shadow=x+geometric*epsilon;
    var light=sampleLight(shadow,seed);
    if(light.ambient){light.radiance*=occlusion;}
    let nl=dot(n,light.direction);
    if (light.pdf>0. && nl>0. && dot(geometric,light.direction)>0.) {
      if (kind==0u) { recordLight(r,shadow,light,weight*data*(nl/pi),nl/pi); }
      if (kind==1u) {
        recordLight(r,shadow,light,weight*directMetal(-d,n,light.direction,data,a2),specularPdf(-d,n,light.direction,a2));
      }
      let primary=paramU32(24u)==24u && load2(s+8u)==0.;
      if (kind==4u) {
        let probability=pbrReflectionProbability(data,metal,ior,roughness,transmission,dot(-d,n));
        let glossy=select(1.,0.,transmission>0. && roughness==0.);
        recordSplitLight(r,shadow,light,weight*(1.-transmission)*diffusePbr(-d,n,light.direction,data,metal,ior),
          weight*glossy*directMetal(-d,n,light.direction,pbrF0(data,metal,ior),a2),
          (1.-probability)*(1.-transmission)*nl/pi,glossy*probability*specularPdf(-d,n,light.direction,a2),primary);
      }
      if (kind==2u) {
        let h=normalize(light.direction-d);
        let t=refract(d,h,eta);
        let f=select(1.,dielectricFresnel(eta,dot(-d,h),abs(dot(t,h))),any(t!=vec3f(0.)));
        let nv=max(1e-9,dot(-d,n));
        let nh=clamp(dot(n,h),0.,1.);
        let spec=f*ggxDistribution(nh,a2)*masking(nv,a2)*masking(nl,a2)/(4.*nv);
        recordSplitLight(r,shadow,light,vec3f(0.),weight*spec,
          0.,dielectricReflectionPdf(-d,n,light.direction,a2,eta),primary);
      }
    }
  }
  if(kind==4u && transmission>0. && transmissionRoughness>0.) {
    let shadow=x-geometric*epsilon;let light=sampleLight(shadow,seed);
    if(light.pdf>0. && dot(n,light.direction)<0. && dot(geometric,light.direction)<0.) {
      let probability=pbrReflectionProbability(data,metal,ior,roughness,transmission,dot(-d,n));
      markPrimary(s,2u);
      recordLight(r,shadow,light,weight*transmission*thinTransmission(-d,n,light.direction,data,metal,ior,transmissionA2),
        (1.-probability)*transmission*specularPdf(-d,n,reflect(light.direction,n),transmissionA2));
    }
  }
  if (paramU32(21u) == 1u) {
    done(r, s);
    return;
  }
  var next=reflect(d,n);
  var offset=epsilon;
  var pdf=0.;
  if (kind==0u) {
    next=hemisphere(n,sqrt(1.-u),2.*pi*v);
    weight*=data;
    pdf=max(0.,dot(n,next))/pi;
  } else if (kind==1u && roughness==0.) {
    weight*=fresnel(data,-dot(d,n));
  } else if (kind==1u || kind==4u) {
    var probability=1.;
    if (kind==4u) { probability=pbrReflectionProbability(data,metal,ior,roughness,transmission,dot(-d,n)); }
    if (sceneUnit(seed^0x6a71da25u)<probability) {
      let f0=select(data,pbrF0(data,metal,ior),kind==4u);
      if(transmission>0. && roughness==0.) {
        next=reflect(d,n);weight*=fresnel(f0,dot(-d,n))/probability;
      } else {
        let h=microfacet(n,u,v,a2);
        next=reflect(d,h);
        pdf=probability*specularPdf(-d,n,next,a2);
        if (pdf<=0.) { done(r,s);return; }
        weight*=directMetal(-d,n,next,f0,a2)/pdf;
      }
      markPrimary(s,1u);
    } else if(transmission>0. && sceneUnit(seed^0x314a1c27u)<transmission) {
      offset=-epsilon;
      if(transmissionRoughness==0.) {
        next=d;
        weight*=data*(1.-metal)*(1.-fresnel(vec3f(dielectricF0(ior)),dot(-d,n)))/(1.-probability);
      } else {
        let h=microfacet(n,u,v,transmissionA2);
        next=reflect(reflect(d,h),n);
        pdf=(1.-probability)*transmission*specularPdf(-d,n,reflect(next,n),transmissionA2);
        if(pdf<=0.){done(r,s);return;}
        weight*=transmission*thinTransmission(-d,n,next,data,metal,ior,transmissionA2)/pdf;
      }
      markPrimary(s,2u);
    } else {
      next=hemisphere(n,sqrt(1.-u),2.*pi*v);
      pdf=(1.-probability)*(1.-transmission)*max(0.,dot(n,next))/pi;
      if (pdf<=0.) { done(r,s);return; }
      weight*=(1.-transmission)*diffusePbr(-d,n,next,data,metal,ior)/pdf;
      markPrimary(s,0u);
    }
  } else {
    let glossy=roughness>0. && eta!=1.;
    var h=n;
    if (glossy) { h=microfacet(n,u,v,a2); }
    let vh=dot(-d,h);
    if (vh<=0.) { done(r,s);return; }
    next=reflect(d,h);
    let transmitted=refract(d,h,eta);
    let f=select(1.,dielectricFresnel(eta,vh,abs(dot(transmitted,h))),any(transmitted!=vec3f(0.)));
    var lobe=1u;
    let choice=select(u,sceneUnit(seed^0xd031c47bu),glossy);
    if (choice>=f) {
      next=transmitted;
      lobe=2u;
      offset=-epsilon;
      weight*=eta*eta;
      if (entering) {
        store7(k+stackSize,id);
        store2(s+3u,depth+1.);
      } else { store2(s+3u,depth-1.); }
    }
    if (glossy) {
      let nv=max(1e-9,dot(n,-d));
      let nh=clamp(dot(n,h),1e-9,1.);
      let nl=abs(dot(n,next));
      if (dot(n,next)*offset<=0.) { done(r,s);return; }
      weight*=masking(nv,a2)*masking(nl,a2)*vh/(nv*nh);
      // Transmission connections use the BSDF sampler alone. Only reflected
      // connections have an alternate explicit-light strategy.
      if (lobe==1u) { pdf=f*specularPdf(-d,n,next,a2); }
    }
    markPrimary(s,lobe);
  }
  weight*=occlusion;
  if (bounce >= 5u) {
    let survive = clamp(max(weight.x, max(weight.y, weight.z)), .08, .95);
    if (sceneUnit(seed ^ 0x17b10327u) >= survive) { done(r, s); return; }
    weight /= survive;
  }
  if (dot(next,geometric) * offset <= 0.) { done(r,s);return; }
  continuePath(r, s, x + geometric * offset, next, weight, pdf);
}
`;}

export const applyPathLight = /* wgsl */ `
fn compute(p: vec3u, local: vec3u, group: vec3u) {
  let pixel = p.y * paramU32(0u) + p.x;
  let r = pixel * 8u;
  if (load1(pixel*4u) != 0u && load3(pixel*4u) < load2(r + 3u)) { return; }
  let stride = paramU32(1u);
  let s = pixel * stride;
  let color = vec3f(load2(r),load2(r+1u),load2(r+2u));
  if (!any(color != vec3f(0.))) { return; }
  store0(s, load0(s) + color.x);
  store0(s + 1u, load0(s + 1u) + color.y);
  store0(s + 2u, load0(s + 2u) + color.z);
  if (stride == 24u) {
    if (load2(r+7u)!=0.) {
      let spec=vec3f(load2(r+4u),load2(r+5u),load2(r+6u));
      let diffuse=color-spec;
      for (var i=0u;i<3u;i++) {
        store0(s+9u+i,load0(s+9u+i)+diffuse[i]);
        store0(s+12u+i,load0(s+12u+i)+spec[i]);
      }
    } else {
      let group=max(1u,u32(load0(s+8u)))-1u;
      let at=s+9u+group*3u;
      store0(at,load0(at)+color.x);
      store0(at+1u,load0(at+1u)+color.y);
      store0(at+2u,load0(at+2u)+color.z);
    }
  }
}
`;

export const sumPath = /* wgsl */ `
fn compute(p: vec3u, local: vec3u, group: vec3u) {
  let pixel = p.y * paramU32(0u) + p.x;
  let stride = paramU32(2u);
  let aovs = stride == 24u;
  let channels = select(3u,18u,aovs);
  let s = pixel * stride;
  let r = pixel * channels;
  let sampleIndex = paramU32(1u);
  let sampleCount = paramU32(3u);
  for (var i = 0u; i < channels; i++) {
    var v = load0(s + i + select(0u,6u,i>=3u));
    if (sampleIndex != 0u) { v += load1(r + i); }
    if (aovs && sampleIndex+1u==sampleCount) { v /= f32(sampleCount); }
    store1(r + i, v);
  }
}
`;

export const displayPath = /* wgsl */ `
fn pixel(p: vec2u) -> vec4f {
  let i = (p.y * outputSize().x + p.x) * paramU32(1u);
  return vec4f(vec3f(data0(i), data0(i + 1u), data0(i + 2u)) / paramF32(0u), 1.);
}
`;
