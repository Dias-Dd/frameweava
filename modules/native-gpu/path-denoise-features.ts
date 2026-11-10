import type {NativeStageInit} from './authoring.ts';
import type {GpuDataBuffer} from '../gpu-effects/compute-types.ts';
import {sceneRead,sceneWrite} from './scene.ts';
import {sceneTextureSampling} from './scene-textures.ts';
import {sceneShading} from './scene-shading.ts';

// Separate from center-primary depth/ID/motion guides: these two feature planes
// accumulate exactly the jittered, lens-sampled, shutter-sampled Beauty rays.
const features=(storage:'f32'|'u32')=>/* wgsl */ `
${sceneTextureSampling('load4','load5',storage)}
${sceneShading('load4','load7')}
fn compute(p:vec3u,local:vec3u,group:vec3u) {
  let pixel=p.y*paramU32(0u)+p.x;
  let i=pixel*4u;let r=pixel*3u;
  let normalBase=paramU32(0u)*paramU32(1u)*3u;
  var albedo=vec3f(0.);var normal=vec3f(0.);
  if(load0(i)!=0u) {
    let id=load0(i+1u);let m=id*8u;let maps=shadingMeta(id);
    let triangle=load0(i+2u);let bary=vec2f(load1(i+1u),load1(i+2u));
    let uvBase=load4(maps);var uv=vec2f(0.);
    if(uvBase!=0u){uv=sceneUV(triangle,uvBase,bary);}
    let outward=vec3f(load2(i),load2(i+1u),load2(i+2u));
    normal=sceneNormal(id,triangle,bary,uv,select(-outward,outward,load2(i+3u)==1.));
    let kind=u32(load3(m+3u));
    albedo=vec3f(load3(m),load3(m+1u),load3(m+2u))*sceneTexture(load4(maps+1u),uv).rgb*sceneVertexColor(id,triangle,bary).rgb;
    // These are bounded denoiser features, never a clamp of Beauty/HDR data.
    // For refractive surfaces use OIDN's documented first-hit white fallback.
    if(kind==2u||kind==3u||(kind==4u&&load3(m+7u)>0.)){albedo=vec3f(1.);}
    albedo=clamp(albedo,vec3f(0.),vec3f(1.));
  }
  for(var c=0u;c<3u;c++) {
    var a=albedo[c];var n=normal[c];
    if(paramU32(2u)!=0u){a+=load8(r+c);n+=load8(normalBase+r+c);}
    if(paramU32(2u)+1u==paramU32(3u)){a/=f32(paramU32(3u));n/=f32(paramU32(3u));}
    store8(r+c,a);store8(normalBase+r+c,n);
  }
}
`;

export async function preparePathDenoiseFeatures(init:NativeStageInit,storage:'f32'|'u32') {
  const {gpu,width,height}=init;
  const capture=await gpu.compileCompute({abiVersion:1,id:'frameweave/scene/path-denoise-features',version:'1.0.0',
    bindings:[{type:'u32',access:'read'},sceneRead,sceneRead,sceneRead,{type:'u32',access:'read'},
      {type:storage,access:'read'},sceneRead,sceneRead,sceneWrite],parameterWords:4,workgroupSize:[8,8,1],code:features(storage)});
  return (inputs:readonly GpuDataBuffer[],target:GpuDataBuffer,sample:number,samples:number)=>gpu.dispatch(capture,[...inputs,target],{
    workItems:[width,height,1],parameters:Uint32Array.of(width,height,sample,samples),
  });
}
