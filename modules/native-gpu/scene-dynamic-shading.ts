import type {NativeStageInit} from './authoring.ts';
import {triangleShadingWords} from './scene-shading.ts';

const gatherShading = /* wgsl */ `
fn fromPosition(i:u32)->vec3f {
  let k=i*3u;
  return vec3f(load0(k),load0(k+1u),load0(k+2u));
}
fn vertexNormal(i:u32)->vec3f {
  let k=i*3u;
  return vec3f(load2(k),load2(k+1u),load2(k+2u));
}
fn dataUV(i:u32)->vec2f {
  return vec2f(bitcast<f32>(load3(i)),bitcast<f32>(load3(i+1u)));
}
fn writeVector(i:u32,v:vec3f) {
  store3(i,bitcast<u32>(v.x));store3(i+1u,bitcast<u32>(v.y));store3(i+2u,bitcast<u32>(v.z));
}
fn unitOrZero(v:vec3f)->vec3f {
  let m=max(abs(v.x),max(abs(v.y),abs(v.z)));
  if (m==0.) { return vec3f(0.); }
  return normalize(v/m);
}
fn compute(p:vec3u,local:vec3u,group:vec3u) {
  let triangle=p.x;
  let at=paramU32(0u)+triangle*${triangleShadingWords}u;
  let a=load1(triangle*3u);let b=load1(triangle*3u+1u);let c=load1(triangle*3u+2u);
  writeVector(at,unitOrZero(vertexNormal(a)));
  writeVector(at+3u,unitOrZero(vertexNormal(b)));
  writeVector(at+6u,unitOrZero(vertexNormal(c)));
  var tangent=vec3f(0.);var bitangent=vec3f(0.);
  let base=paramU32(1u);
  if (base!=0u) {
    let uv=base+triangle*6u;
    let uv0=dataUV(uv);let uv1=dataUV(uv+2u)-uv0;let uv2=dataUV(uv+4u)-uv0;
    let det=uv1.x*uv2.y-uv2.x*uv1.y;
    if (det!=0.) {
      let x=fromPosition(a);let e=fromPosition(b)-x;let f=fromPosition(c)-x;
      tangent=unitOrZero((e*uv2.y-f*uv1.y)*sign(det));
      bitangent=unitOrZero((f*uv1.x-e*uv2.x)*sign(det));
    }
  }
  writeVector(at+9u,tangent);writeVector(at+12u,bitangent);
  let authored=paramU32(2u);
  if(authored!=0u){
    let ids=array<u32,3>(a,b,c);
    for(var vertex=0u;vertex<3u;vertex++){for(var channel=0u;channel<6u;channel++)
      {store3(authored+triangle*18u+vertex*6u+channel,bitcast<u32>(load4(ids[vertex]*6u+channel)));}}
  }
}
`;

export function compileDynamicShading(gpu:NativeStageInit['gpu']) {
  return gpu.compileCompute({
    abiVersion:1,id:'frameweave/scene/deformed-shading',version:'1.0.0',workgroupSize:[64,1,1],parameterWords:3,
    bindings:[{type:'f32',access:'read'},{type:'u32',access:'read'},
      {type:'f32',access:'read'},{type:'u32',access:'read_write'},{type:'f32',access:'read'}],code:gatherShading,
  });
}
