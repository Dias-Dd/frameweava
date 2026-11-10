import {EngineError} from '../../src/core/errors.ts';
import type {FrameContext} from '../../src/core/types.ts';
import type {GpuDataBuffer,GpuSize3} from '../gpu-effects/compute-types.ts';
import type {GpuResourceArena} from '../gpu-effects/resource-arena.ts';
import type {NativeStageInit} from './authoring.ts';
import type {SceneVolume} from './scene-volume.ts';

/** Scalar, cell-centered, trilinearly sampled density. X is contiguous. Bounds
 * come from the enclosing volume; values are dimensionless multipliers of its
 * extinction. Exactly one source is required. No Color/Alpha conversion. */
export interface SceneDensityGrid {
  version:1;
  dimensions:GpuSize3;
  /** Finite upper bound on density, used by null-collision sampling. */
  maximum:number;
  values?:ArrayLike<number>;
  /** The producer borrows the arena for frame-owned allocations. Borrowed
   * initialization buffers stay owned by the author. No CPU readback occurs. */
  gpu?:(context:FrameContext,arena:GpuResourceArena)=>GpuDataBuffer|Promise<GpuDataBuffer>;
}

export const volumeHeaderWords=4,volumeRecordWords=16,emissiveVolumeRecordWords=28;
const fail=(message:string):never=>{throw new EngineError('E_NATIVE_SCENE_VOLUME',message);};

export function sceneVolumeLayout(volumes:readonly SceneVolume[]=[],maxBytes=0xffffffff*4) {
  const emissive=volumes.some(v=>v.emission!==undefined),stride=emissive?emissiveVolumeRecordWords:volumeRecordWords;
  let length=volumeHeaderWords+Math.max(1,volumes.length)*stride;
  function source(grid:SceneDensityGrid|undefined) {
    if(!grid)return undefined;
    const count=grid.dimensions?.reduce((a,b)=>a*b,1);
    if(grid.version!==1||Object.keys(grid).some(k=>!['version','dimensions','maximum','values','gpu'].includes(k))||
        grid.dimensions?.length!==3||!grid.dimensions.every(n=>Number.isSafeInteger(n)&&n>0&&n<=0x7fffffff)||
        !Number.isSafeInteger(count)||count!<1||!Number.isFinite(Math.fround(grid.maximum))||Math.fround(grid.maximum)<=0||
        Number(grid.values!==undefined)+Number(grid.gpu!==undefined)!==1||grid.gpu!==undefined&&typeof grid.gpu!=='function'||
        grid.values!==undefined&&grid.values.length!==count)
      return fail('Density v1 needs positive dimensions, a finite positive maximum and one complete values/GPU source');
    const offset=length;length+=count!;
    return {grid:{...grid,dimensions:[...grid.dimensions] as unknown as GpuSize3},offset,count:count!};
  }
  const sources=volumes.map(v=>source(v.density));
  const emissions=volumes.map(v=>{
    const e=v.emission;if(e===undefined)return undefined;
    if(!e||typeof e!=='object'||Object.keys(e).some(k=>!['coefficient','density','samples'].includes(k))||
       !Array.isArray(e.coefficient)||e.coefficient.length!==3||[0,1,2].some(i=>!Object.hasOwn(e.coefficient,i)||typeof e.coefficient[i]!=='number'||!Number.isFinite(Math.fround(e.coefficient[i]))||e.coefficient[i]<0)||
       e.samples!==undefined&&(!Number.isSafeInteger(e.samples)||e.samples<1||e.samples>0xffffffff))
      fail('Emission requires three finite nonnegative radiance-per-meter channels and an optional positive u32 sample count');
    return {coefficient:e.coefficient.map(Math.fround),samples:e.samples??8,source:source(e.density)};
  });
  if(!Number.isSafeInteger(length)||length>0xffffffff||!Number.isSafeInteger(maxBytes)||maxBytes<1||length*4>maxBytes)
    fail('Complete volume table and density grids exceed the caller/device byte or u32 addressing budget');
  const words=new Float32Array(length),bits=new Uint32Array(words.buffer);
  words.set([emissive?3:2,volumes.length,0,0]);
  function put(field:ReturnType<typeof source>,at:number,maximum:number) {
    if(!field)return;
    bits[at]=field.offset;bits.set(field.grid.dimensions,at+1);words[maximum]=field.grid.maximum;
    if(field.grid.values)for(let i=0;i<field.count;i++) {
      const value=Math.fround(field.grid.values[i]);
      if(!Number.isFinite(value)||value<0||value>words[maximum])fail('Static density values must be finite and within [0, maximum]');
      words[field.offset+i]=value;
    }
  }
  for(const [id,volume] of volumes.entries()) {
    const {min,max}=volume.bounds;
    const sigma=Math.fround(volume.extinction),g=Math.fround(volume.anisotropy??0);
    if(min.length!==3||max.length!==3||volume.albedo.length!==3||
        ![...min,...max,...volume.albedo,g,sigma].every(x=>Number.isFinite(Math.fround(x)))||
        min.some((v,k)=>Math.fround(v)>=Math.fround(max[k]))||sigma<0||
        volume.albedo.some(x=>x<0||x>1)||Math.abs(g)>=1)
      fail('Volumes require ordered finite bounds, nonnegative extinction, normalized albedo and anisotropy inside (-1,1)');
    const at=volumeHeaderWords+id*stride,field=sources[id];
    if(field&&(!Number.isFinite(Math.fround(sigma*field.grid.maximum))||sigma>0&&Math.fround(sigma*field.grid.maximum)===0))
      fail('Density majorant times extinction must be representable in F32');
    words.set([...min,sigma,...max,g,...volume.albedo,0,0,0,0,1],at);
    put(field,at+11,at+15);
    const emission=emissions[id];
    if(emission){words.set(emission.coefficient,at+16);bits[at+19]=emission.samples;words[at+24]=1;put(emission.source,at+20,at+24);}
  }
  const fields=[...sources,...emissions.map(e=>e?.source)];
  return {words,async frame(gpu:NativeStageInit['gpu'],arena:GpuResourceArena,context:FrameContext,base:GpuDataBuffer) {
    if(!fields.some(s=>s?.grid.gpu))return base;
    const result=arena.buffer(await gpu.cloneBuffer(base));
    // One producer shared by extinction and/or emission still runs only once.
    const produced=new Map<NonNullable<SceneDensityGrid['gpu']>,Promise<GpuDataBuffer>>();
    for(const field of fields) {
      const factory=field?.grid.gpu;if(!field||!factory)continue;
      let pending=produced.get(factory);
      if(!pending){pending=Promise.resolve(factory(context,arena));produced.set(factory,pending);}
      const data=await pending,info=data?.info;
      if(!info||info.type!=='f32'||info.components!==1||info.length!==field.count||
          info.dimensions.some((n,k)=>n!==field.grid.dimensions[k])||info.origin.some(n=>n!==0)||info.domain.some((n,k)=>n!==info.dimensions[k]))
        fail('Density producer must return the complete declared F32 scalar field, without tile offsets');
      await gpu.copyBuffer(data,result,{targetOffset:field.offset,length:field.count});
    }
    return result;
  }};
}

/** Original null-collision/ratio tracking implementation. Algorithm background:
 * https://pbr-book.org/4ed/Light_Transport_II_Volume_Rendering/Volume_Scattering_Integrators
 * No upstream implementation source is incorporated. */
const densityShader=(recordWords:number)=>/* wgsl */`
fn mediumRecord(id:u32)->u32 {return ${volumeHeaderWords}u+id*${recordWords}u;}
fn mediumGrid(id:u32)->u32 {return bitcast<u32>(load13(mediumRecord(id)+11u));}
fn mediumMajorant(id:u32)->f32 {let m=mediumRecord(id);return load13(m+3u)*load13(m+15u);}
fn densityVoxel(base:u32,dims:vec3u,p:vec3i)->f32 {
  let q=vec3u(clamp(p,vec3i(0),vec3i(dims)-1));
  return load13(base+(q.z*dims.y+q.y)*dims.x+q.x);
}
fn mediumDensity(id:u32,p:vec3f)->f32 {
  let base=mediumGrid(id);if(base==0u){return 1.;}
  let m=mediumRecord(id);
  let dims=vec3u(bitcast<u32>(load13(m+12u)),bitcast<u32>(load13(m+13u)),bitcast<u32>(load13(m+14u)));
  let low=vec3f(load13(m),load13(m+1u),load13(m+2u));
  let high=vec3f(load13(m+4u),load13(m+5u),load13(m+6u));
  let q=(p-low)/(high-low)*vec3f(dims)-.5;
  let i=vec3i(floor(q));let f=fract(q);
  let a=mix(mix(densityVoxel(base,dims,i),densityVoxel(base,dims,i+vec3i(1,0,0)),f.x),
    mix(densityVoxel(base,dims,i+vec3i(0,1,0)),densityVoxel(base,dims,i+vec3i(1,1,0)),f.x),f.y);
  let b=mix(mix(densityVoxel(base,dims,i+vec3i(0,0,1)),densityVoxel(base,dims,i+vec3i(1,0,1)),f.x),
    mix(densityVoxel(base,dims,i+vec3i(0,1,1)),densityVoxel(base,dims,i+vec3i(1,1,1)),f.x),f.y);
  return mix(a,b,f.z);
}
fn mediumRandom(seed:u32,index:u32)->f32 {return sceneUnit(hashScene(seed^hashScene(index+0x517cc1b7u)));}
fn mediumFlight(random:f32,majorant:f32)->f32 {return -log(1.-random)/majorant;}
`;

export const densityTransport=densityShader(volumeRecordWords);
export const emissiveDensityTransport=densityShader(emissiveVolumeRecordWords);
