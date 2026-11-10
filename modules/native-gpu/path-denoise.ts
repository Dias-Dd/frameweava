import {EngineError} from '../../src/core/errors.ts';
import type {GpuResourceArena} from '../gpu-effects/resource-arena.ts';
import type {GpuDataBuffer} from '../gpu-effects/compute-types.ts';
import type {GpuPixelImage} from '../gpu-effects/pixel-types.ts';
import type {NativeStageInit} from './authoring.ts';
import {sceneRead, sceneWrite} from './scene.ts';
import {sceneTextureSampling} from './scene-textures.ts';
import {sceneShading} from './scene-shading.ts';

export interface NativePathDenoiseOptions {
  /** Dyadic spatial passes. Default 3, reduced to fit very small images. */
  levels?: number;
  /** Deterministic adjacent-frame reprojection. Re-evaluates the previous frame. */
  temporal?: boolean | NativePathTemporalDenoiseOptions;
  /** Relative depth difference scale. Default .045. */
  depthSigma?: number;
  /** Angular discrimination. Default 24. */
  normalPower?: number;
  /** Distance in log-encoded albedo. Default .12. */
  albedoSigma?: number;
  /** Distance in log-encoded radiance. Default 1. */
  colorSigma?: number;
}

export interface NativePathTemporalDenoiseOptions {
  /** History contribution after validation and clipping. Default .5. */
  weight?: number;
  /** Relative previous-depth tolerance. Default .01. */
  depthTolerance?: number;
  /** Minimum world-normal agreement. Default .9. */
  normalThreshold?: number;
}

const guides=(storage:'f32'|'u32')=>/* wgsl */ `
${sceneTextureSampling('load4','load5',storage)}
${sceneShading('load4','load7')}
fn compute(p: vec3u, local: vec3u, group: vec3u) {
  let pixel = p.y * paramU32(0u) + p.x;
  let i = pixel * 4u;
  let out = pixel * 8u;
  let id = load0(i + 1u);
  let r = pixel * 3u;
  let d = vec3f(load6(r), load6(r + 1u), load6(r + 2u));
  let z = load1(i) * dot(d, vec3f(paramF32(1u), paramF32(2u), paramF32(3u)));
  let hit = load0(i) != 0u && z <= paramF32(4u);
  var rgb = vec3f(0.);
  var normal = vec3f(0.);
  var label = 0.;
  if (hit) {
    let m = id * 8u;
    let maps = shadingMeta(id);
    let uvBase = load4(maps);
    let bary = vec2f(load1(i + 1u), load1(i + 2u));
    let triangle = load0(i+2u);
    var uv = vec2f(0.);
    if (uvBase != 0u) { uv = sceneUV(triangle, uvBase, bary); }
    let outward = vec3f(load2(i),load2(i+1u),load2(i+2u));
    normal = sceneNormal(id,triangle,bary,uv,select(-outward,outward,load2(i+3u)==1.));
    let kind = u32(load3(m + 3u));
    label = f32(id + 1u) * select(1., -1., kind == 1u || kind == 2u || (kind == 4u && (load3(m + 5u) > 0. || load3(m + 7u) > 0.)));
    rgb = select(vec3f(load3(m), load3(m + 1u), load3(m + 2u)), vec3f(1.), kind == 2u)
      * sceneTexture(load4(maps + 1u), uv).rgb*sceneVertexColor(id,triangle,bary).rgb;
  }
  store8(out, normal.x); store8(out + 1u, normal.y); store8(out + 2u, normal.z);
  store8(out + 3u, z); store8(out + 4u, rgb.x); store8(out + 5u, rgb.y); store8(out + 6u, rgb.z);
  store8(out + 7u, label);
}
`;

const atrous = /* wgsl */ `
fn pathGuide(p: vec2i) -> u32 { return (u32(p.y) * outputSize().x + u32(p.x)) * 8u; }
fn logRgb(v: vec3f) -> vec3f { return sign(v) * log(1. + abs(v)); }
fn guideAlbedo(i: u32) -> vec3f { return logRgb(vec3f(data0(i + 4u), data0(i + 5u), data0(i + 6u))); }
fn guideNormal(i: u32) -> vec3f { return vec3f(data0(i), data0(i + 1u), data0(i + 2u)); }
fn relativeDepth(a: f32, b: f32) -> f32 { return abs(a - b) / max(1e-4, max(a, b)); }
fn pixel(p: vec2u) -> vec4f {
  let taps = array<f32, 5>(1., 4., 6., 4., 1.);
  let c = vec2i(p);
  let center = read0(c);
  let g = pathGuide(c);
  let label = data0(g + 7u);
  let stride = i32(paramU32(0u));
  if (label < 0. && stride > 2) { return center; }
  let radiance = logRgb(center.rgb);
  let normal = guideNormal(g);
  let albedo = guideAlbedo(g);
  let depth = data0(g + 3u);
  var sum = 0.;
  var average = center.rgb;
  for (var y = -2; y <= 2; y++) {
    for (var x = -2; x <= 2; x++) {
      let q = c + vec2i(x, y) * stride;
      if (any(q < vec2i(0)) || any(q >= vec2i(outputSize()))) { continue; }
      let j = pathGuide(q);
      if (data0(j + 7u) != label) { continue; }
      let value = read0(q).rgb;
      let sigma = paramF32(4u) * select(1., .35, label < 0.);
      let range = length(logRgb(value) - radiance) / sigma;
      var w = taps[x + 2] * taps[y + 2] * exp(-range);
      if (label != 0.) {
        w *= pow(clamp(dot(normal, guideNormal(j)), 0., 1.), paramF32(2u));
        w *= exp(-relativeDepth(depth, data0(j + 3u)) / paramF32(1u));
        w *= exp(-length(albedo - guideAlbedo(j)) / paramF32(3u));
      }
      if (w <= 0.) { continue; }
      sum += w;
      average = mix(average, value, w / sum);
    }
  }
  return vec4f(average, center.a);
}
`;

export async function preparePathGuides(init:NativeStageInit,storage:'f32'|'u32'='f32') {
  const {gpu,width,height}=init;
  const capture = await gpu.compileCompute({
    abiVersion: 1, id: 'frameweave/scene/path-denoise-guides', version: '1.0.0',
    bindings: [{type:'u32',access:'read'}, sceneRead, sceneRead, sceneRead, {type:'u32',access:'read'}, {type:storage,access:'read'}, sceneRead, sceneRead, sceneWrite],
    parameterWords: 5, workgroupSize: [8,8,1], code: guides(storage),
  });
  return async (arena: GpuResourceArena, inputs: readonly GpuDataBuffer[], camera: Float32Array) => {
    const guideParams = Float32Array.of(0,...camera);
    new Uint32Array(guideParams.buffer)[0] = width;
    const guide = arena.buffer(await gpu.createBuffer({type:'f32',length:width*height*8}));
    await gpu.dispatch(capture, [...inputs,guide], {workItems:[width,height,1], parameters:guideParams});
    return guide;
  };
}

export async function preparePathDenoiser(init: NativeStageInit, options: NativePathDenoiseOptions) {
  const {gpu, width, height} = init;
  const usefulLevels = 1 + Math.floor(Math.log2(Math.max(width,height)));
  const levels = options.levels ?? Math.min(3, usefulLevels);
  const controls = [options.depthSigma ?? .045, options.normalPower ?? 24,
    options.albedoSigma ?? .12, options.colorSigma ?? 1];
  if (!Number.isSafeInteger(levels) || levels < 1 || levels > usefulLevels ||
      2 ** levels + Math.max(width,height) >= 0x7fffffff ||
      !controls.every(v => Number.isFinite(Math.fround(v)) && Math.fround(v) > 0))
    throw new EngineError('E_NATIVE_PATH_DENOISE', 'Require a useful dyadic level count and positive finite guide controls');
  const filter = await gpu.compile({
    abiVersion: 2, id: 'frameweave/scene/path-denoise-atrous', version: '1.0.0',
    inputCount: 1, dataInputs: [{type:'f32'}], parameterWords: 5, code: atrous,
  });
  return {
    async filter(arena: GpuResourceArena, source: GpuPixelImage, guide: GpuDataBuffer,
        format: GpuPixelImage['info']['format']) {
      let image = arena.image(source);
      const params = Float32Array.of(0,...controls), words = new Uint32Array(params.buffer);
      for (let level = 0; level < levels; level++) {
        words[0] = 2 ** level;
        image = arena.image(await gpu.run(filter,[image],{data:[guide],parameters:params,
          output:{format:level===levels-1?format:'rgba32float'}}));
      }
      return arena.keep(image);
    },
  };
}


const temporalReprojection = /* wgsl */ `
fn normal(i:u32,which:u32)->vec3f {
  if(which==0u){return vec3f(data0(i),data0(i+1u),data0(i+2u));}
  return vec3f(data1(i),data1(i+1u),data1(i+2u));
}
fn encode(v:vec3f)->vec3f { return sign(v)*log(1.+abs(v)); }
fn decode(v:vec3f)->vec3f { return sign(v)*(exp(abs(v))-1.); }
fn pixel(p:vec2u)->vec4f {
  let center=read0(vec2i(p));
  let i=(p.y*outputSize().x+p.x)*4u;
  let guide=i*2u;
  let label=data0(guide+7u);
  if(label<=0. || data2(i+3u)!=1.){return center;}
  let q=vec2f(p)+vec2f(data2(i),data2(i+1u));
  let floorQ=vec2i(floor(q));let f=fract(q);
  var result=vec3f(0.);var weight=0.;
  for(var y=0;y<=1;y++){for(var x=0;x<=1;x++){
    let xy=floorQ+vec2i(x,y);
    if(any(xy<vec2i(0)) || any(xy>=vec2i(outputSize()))){continue;}
    let previous=(u32(xy.y)*outputSize().x+u32(xy.x))*8u;
    if(data1(previous+7u)!=label){continue;}
    let expected=data2(i+2u);let depth=data1(previous+3u);
    if(abs(expected-depth)>paramF32(1u)*max(1e-4,max(abs(expected),abs(depth)))){continue;}
    if(dot(normal(guide,0u),normal(previous,1u))<paramF32(2u)){continue;}
    let a=vec3f(data0(guide+4u),data0(guide+5u),data0(guide+6u));
    let b=vec3f(data1(previous+4u),data1(previous+5u),data1(previous+6u));
    if(length(encode(a)-encode(b))>.05){continue;}
    let w=select(1.-f.x,f.x,x==1)*select(1.-f.y,f.y,y==1);
    result+=encode(read1(xy).rgb)*w;weight+=w;
  }}
  if(weight<=.001){return center;}
  var lo=encode(read2(vec2i(p)).rgb);var hi=lo;
  for(var y=-1;y<=1;y++){for(var x=-1;x<=1;x++){
    let xy=vec2i(p)+vec2i(x,y);
    if(any(xy<vec2i(0))||any(xy>=vec2i(outputSize()))){continue;}
    let neighbor=(u32(xy.y)*outputSize().x+u32(xy.x))*8u;
    if(data0(neighbor+7u)!=label){continue;}
    let value=encode(read2(xy).rgb);
    lo=min(lo,value);hi=max(hi,value);
  }}
  let history=decode(clamp(result/weight,lo,hi));
  return vec4f(mix(center.rgb,history,paramF32(0u)*min(weight,1.)),center.a);
}
`;

export async function preparePathTemporalDenoiser(init:NativeStageInit,options:NativePathTemporalDenoiseOptions={}) {
  const values=Float32Array.of(options.weight??.5,options.depthTolerance??.01,options.normalThreshold??.9);
  if(!values.every(Number.isFinite)||values[0]<=0||values[0]>=1||values[1]<=0||values[2]<0||values[2]>1)
    throw new EngineError('E_NATIVE_PATH_DENOISE','Invalid temporal reprojection controls');
  const filter=await init.gpu.compile({
    abiVersion:2,id:'frameweave/scene/path-denoise-temporal',version:'1.0.0',
    inputCount:3,dataInputs:[{type:'f32'},{type:'f32'},{type:'f32'}],parameterWords:3,code:temporalReprojection,
  });
  return (current:GpuPixelImage,history:GpuPixelImage,raw:GpuPixelImage,currentGuide:GpuDataBuffer,historyGuide:GpuDataBuffer,
    motion:GpuDataBuffer,format:GpuPixelImage['info']['format'])=>init.gpu.run(filter,[current,history,raw],{
      data:[currentGuide,historyGuide,motion],parameters:values,output:{format},
    });
}
