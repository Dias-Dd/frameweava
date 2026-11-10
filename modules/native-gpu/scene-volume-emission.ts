/** Isotropic radiance-per-meter source integrated along the already sampled
 * collision-free path segment. Its survival probability already estimates
 * participating-media transmittance; multiplying mediumBeam again would bias
 * absorption twice. The separate solid-dielectric Beer term is explicit here.
 * Original implementation; equation background:
 * https://www.pbr-book.org/4ed/Light_Transport_II_Volume_Rendering/The_Equation_of_Transfer
 * https://github.com/AcademySoftwareFoundation/MaterialX/blob/main/documents/Specification/MaterialX.PBRSpec.md
 */
export const emissionSourceTransport=/* wgsl */`
fn emissionDensity(id:u32,p:vec3f)->f32 {
  let m=mediumRecord(id);let base=bitcast<u32>(load13(m+20u));
  let dims=vec3u(bitcast<u32>(load13(m+21u)),bitcast<u32>(load13(m+22u)),bitcast<u32>(load13(m+23u)));
  let low=vec3f(load13(m),load13(m+1u),load13(m+2u));
  let high=vec3f(load13(m+4u),load13(m+5u),load13(m+6u));
  let q=(p-low)/(high-low)*vec3f(dims)-.5;
  let i=vec3i(floor(q));let f=fract(q);
  let a=mix(mix(densityVoxel(base,dims,i),densityVoxel(base,dims,i+vec3i(1,0,0)),f.x),
    mix(densityVoxel(base,dims,i+vec3i(0,1,0)),densityVoxel(base,dims,i+vec3i(1,1,0)),f.x),f.y);
  let b=mix(mix(densityVoxel(base,dims,i+vec3i(0,0,1)),densityVoxel(base,dims,i+vec3i(1,0,1)),f.x),
    mix(densityVoxel(base,dims,i+vec3i(0,1,1)),densityVoxel(base,dims,i+vec3i(1,1,1)),f.x),f.y);
  let value=mix(a,b,f.z);let maximum=load13(m+24u);
  if(!(value>=0.&&value-maximum<=maximum*.000003)){return -1.;}
  return value;
}
fn solidBeerInterval(a:f32,near:f32,far:f32)->f32 {
  let distance=far-near;let x=a*distance;
  if(x<.001){return exp(-a*near)*distance*(1.-.5*x+x*x/6.-x*x*x/24.);}
  return exp(-a*near)*(1.-exp(-x))/a;
}
fn mediumEmission(origin:vec3f,direction:vec3f,limit:f32,seed:u32,solidAbsorption:vec3f)->vec3f {
  var result=vec3f(0.);
  for(var id=0u;id<paramU32(22u);id++) {
    let m=mediumRecord(id);let coefficient=vec3f(load13(m+16u),load13(m+17u),load13(m+18u));
    if(!any(coefficient>vec3f(0.))){continue;}
    let interval=mediumInterval(id,origin,direction,limit);
    if(interval.y<=interval.x){continue;}
    if(bitcast<u32>(load13(m+20u))==0u) {
      result+=coefficient*vec3f(solidBeerInterval(solidAbsorption.x,interval.x,interval.y),
        solidBeerInterval(solidAbsorption.y,interval.x,interval.y),solidBeerInterval(solidAbsorption.z,interval.x,interval.y));
      continue;
    }
    let samples=bitcast<u32>(load13(m+19u));let step=(interval.y-interval.x)/f32(samples);
    let stream=seed^hashScene(id+0xc3a5c85cu);
    for(var i=0u;i<samples;i++) {
      let distance=interval.x+(f32(i)+mediumRandom(stream,i))*step;
      let density=emissionDensity(id,origin+direction*distance);
      if(density<0.){return vec3f(-1.);}
      result+=coefficient*density*exp(-solidAbsorption*distance)*step;
    }
  }
  return result;
}
`;
