import type {SceneRgb,SceneTransform} from './scene.ts';

export const sceneShadingWords = 16;
export const triangleShadingWords = 15;

export function frameShadingMatrix(m: SceneTransform) {
  const [a,b,c,, d,e,f,, g,h,i] = m;
  const scale = Math.max(Math.abs(a),Math.abs(b),Math.abs(c),Math.abs(d),Math.abs(e),Math.abs(f),Math.abs(g),Math.abs(h),Math.abs(i));
  if (scale === 0) return new Float32Array(18);
  const x = a/scale, y = b/scale, z = c/scale;
  const u = d/scale, v = e/scale, w = f/scale;
  const p = g/scale, q = h/scale, r = i/scale;
  // A common scalar factor cancels when the shader normalizes each basis direction.
  const cofactors = [v*r-w*q,w*p-u*r,u*q-v*p,z*q-y*r,x*r-z*p,y*p-x*q,y*w-z*v,z*u-x*w,x*v-y*u];
  const cofactorScale = Math.max(...cofactors.map(Math.abs));
  return Float32Array.of(x,y,z,u,v,w,p,q,r,...cofactors.map(value=>cofactorScale ? value/cofactorScale : 0));
}

export function sceneTriangleTangents(positions: readonly SceneRgb[], i: number, j: number, k: number,
    uv: readonly (readonly [number,number])[]) {
  const a=positions[i], b=positions[j], c=positions[k], s=uv[i], t=uv[j], u=uv[k];
  const du1=t[0]-s[0], dv1=t[1]-s[1], du2=u[0]-s[0], dv2=u[1]-s[1];
  const determinant=du1*dv2-du2*dv1;
  if (!determinant || !Number.isFinite(determinant)) return [0,0,0,0,0,0];
  // Only direction and handedness are needed. Discard common derivative magnitude.
  const sign=Math.sign(determinant);
  const tangent=a.map((value,axis)=>((b[axis]-value)*dv2-(c[axis]-value)*dv1)*sign);
  const bitangent=a.map((value,axis)=>((c[axis]-value)*du1-(b[axis]-value)*du2)*sign);
  const norm=(v:number[])=>{
    const len=Math.hypot(...v);
    return !len||!Number.isFinite(len)?[0,0,0]:v.map(value=>value/len);
  };
  return [...norm(tangent),...norm(bitangent)];
}

export function sceneShading(meta:string, transform:string) {
  return /* wgsl */ `
fn shadingMeta(id: u32) -> u32 { return 1u + id * ${meta}(0u); }
fn sceneVertexColor(id:u32,primitive:u32,bary:vec2f)->vec4f {
  let base=${meta}(shadingMeta(id)+14u);
  if(base==0u){return vec4f(1.);}
  let at=base+primitive*12u;
  var result=vec4f(0.);
  let weights=vec3f(1.-bary.x-bary.y,bary.x,bary.y);
  for(var vertex=0u;vertex<3u;vertex++) {
    for(var c=0u;c<4u;c++) {result[c]+=bitcast<f32>(${meta}(at+vertex*4u+c))*weights[vertex];}
  }
  return result;
}
fn sceneOcclusion(id:u32,primitive:u32,bary:vec2f,uv:vec2f)->f32 {
  let details=${meta}(shadingMeta(id)+15u);
  if(details==0u){return 1.;}
  let map=${meta}(details+1u);
  if(map==0u){return 1.;}
  let strength=bitcast<f32>(${meta}(details+2u));
  return mix(1.,clamp(sceneTextureAt(map,primitive,bary,uv).r,0.,1.),strength);
}
fn sceneTransmission(id:u32,primitive:u32,bary:vec2f,uv:vec2f)->f32 {
  let details=${meta}(shadingMeta(id)+15u);
  if(details==0u){return 1.;}
  let map=${meta}(details+3u);
  return clamp(sceneTextureAt(map,primitive,bary,uv).r,0.,1.);
}
fn shadingTransform(i: u32, v: vec3f) -> vec3f {
  return vec3f(
    dot(v,vec3f(${transform}(i),${transform}(i+1u),${transform}(i+2u))),
    dot(v,vec3f(${transform}(i+3u),${transform}(i+4u),${transform}(i+5u))),
    dot(v,vec3f(${transform}(i+6u),${transform}(i+7u),${transform}(i+8u))));
}
fn triangleVector(i: u32) -> vec3f {
  return vec3f(bitcast<f32>(${meta}(i)),bitcast<f32>(${meta}(i+1u)),bitcast<f32>(${meta}(i+2u)));
}
fn sceneNormal(id: u32, primitive: u32, bary: vec2f, uv: vec2f, geometric: vec3f) -> vec3f {
  let m = shadingMeta(id);
  let base = ${meta}(m + 4u);
  if (base == 0u) { return geometric; }
  let vertex = base + primitive * ${triangleShadingWords}u;
  let world = id * 18u;
  let object = triangleVector(vertex)*(1.-bary.x-bary.y)
    + triangleVector(vertex+3u)*bary.x + triangleVector(vertex+6u)*bary.y;
  let transformed = shadingTransform(world+9u,object);
  var normal = geometric;
  if (any(transformed != vec3f(0.))) {
    normal = normalize(transformed);
    if (dot(normal,geometric)<0.) { normal = -normal; }
  }
  let map = ${meta}(m + 3u);
  if (map == 0u) { return normal; }
  var objectTangent=triangleVector(vertex+9u);
  var objectBitangent=triangleVector(vertex+12u);
  let details=${meta}(m+15u);
  var authored=0u;if(details!=0u){authored=${meta}(details);}
  if(authored!=0u){
    let at=authored+primitive*18u;let weights=vec3f(1.-bary.x-bary.y,bary.x,bary.y);
    objectTangent=vec3f(0.);objectBitangent=vec3f(0.);
    for(var vertex=0u;vertex<3u;vertex++){
      objectTangent+=triangleVector(at+vertex*6u)*weights[vertex];
      objectBitangent+=triangleVector(at+vertex*6u+3u)*weights[vertex];
    }
  }
  let u = shadingTransform(world,objectTangent);
  let v = shadingTransform(world,objectBitangent);
  let t = u - normal*dot(normal,u);
  if (!any(t != vec3f(0.)) || !any(v != vec3f(0.))) { return normal; }
  let tangent = normalize(t);
  let bitangent = cross(normal,tangent);
  let handedness = select(1.,-1.,dot(bitangent,v)<0.);
  let rgb = clamp(sceneTextureAt(map,primitive,bary,uv).rgb,vec3f(0.),vec3f(1.))*2.-1.;
  let scale = bitcast<f32>(${meta}(m + 5u));
  let range = max(1.,abs(scale));
  let slope = rgb.xy*(scale/range);
  let bumped = tangent*slope.x + bitangent*(slope.y*handedness) + normal*(rgb.z/range);
  if (!any(bumped!=vec3f(0.))) { return normal; }
  let result = normalize(bumped);
  return select(normal,result,dot(result,geometric)>0.);
}
`;
}
