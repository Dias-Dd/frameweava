import {EngineError} from '../../src/core/errors.ts';
import {linear709} from '../../src/media/surface.ts';
import type {GpuResourceArena} from '../gpu-effects/resource-arena.ts';
import type {NativeStageInit} from './authoring.ts';
import type {NativeScene3D,SceneGeometry,SceneMaterial,SceneNode,SceneMapCoordinates} from './scene.ts';
import {environmentDistribution} from './scene-environment.ts';
import {sceneShadingWords,sceneTriangleTangents,triangleShadingWords} from './scene-shading.ts';

export interface SceneTextureRegion {
  x: number; y: number; width: number; height: number;
  wrap?: 'clamp' | 'repeat';
  addressU?: 'clamp' | 'repeat' | 'mirror';
  addressV?: 'clamp' | 'repeat' | 'mirror';
  filter?: 'linear' | 'nearest';
}
export interface SceneTextureAtlas {
  /** Declared image/file Resource ID. PNG/JPEG input is transformed to linear Rec.709. */
  resource: string;
  width: number;
  height: number;
  decode?: 'icc-sdr' | 'surface-v2' | 'rgba32float-le';
  regions: Readonly<Record<string, SceneTextureRegion>>;
}

const fail = (message: string): never => { throw new EngineError('E_NATIVE_SCENE_TEXTURE', message); };

export function sceneTextureLayout(scene: NativeScene3D, nodes: readonly SceneNode[],
    geometries: ReadonlyMap<string, SceneGeometry>) {
  const atlas = scene.textureAtlas;
  if (atlas && (!atlas.resource || !['icc-sdr','surface-v2','rgba32float-le'].includes(atlas.decode??'icc-sdr') ||
      ![atlas.width, atlas.height].every(v => Number.isSafeInteger(v) && v > 0 && v <= 0x7fffffff)))
    fail('A texture atlas needs a declared resource and positive integer dimensions');
  const regions = new Map(Object.entries(atlas?.regions ?? {}).map(([name, region]) => {
    const {x,y,width,height,wrap='clamp',addressU=wrap,addressV=wrap,filter='linear'}=region;
    const modes=['clamp','repeat','mirror'];
    if (!name || ![x, y, width, height].every(Number.isSafeInteger) ||
        x < 0 || y < 0 || width < 1 || height < 1 ||
        x > atlas!.width - width || y > atlas!.height - height || !['clamp', 'repeat'].includes(wrap) || !modes.includes(addressU) || !modes.includes(addressV) || !['linear','nearest'].includes(filter))
      fail(`Invalid texture region ${name}`);
    return [name,[x,y,width,height,modes.indexOf(addressU),modes.indexOf(addressV),Number(filter==='nearest')]] as const;
  }));
  // Word zero is the no-map sentinel. Each instance points to shared UV topology.
  const data = Array<number>(1 + nodes.length * sceneShadingWords).fill(0);
  data[0]=sceneShadingWords;
  const vertexColorOffsets=new Map<string,number>();
  const tangentOffsets=new Map<string,number>(),dynamicTangents=new Map<string,number>();
  const offsets = new Map<string, number>();
  for (const [name, region] of regions) {
    offsets.set(name, data.length);
    data.push(...region, atlas!.width,0);
  }
  const uvStreams=new Map<string,{offset:number;values:readonly (readonly [number,number])[]}>();
  const shadingOffsets=new Map<string,number>();
  const deformed=new Map<string,{vertices:number;variants:{shading:number;tangentUV:number}[]}>();
  let usesAtlas=false,hasCoverage=false;
  const uvWord=new Float32Array(1),uvBits=new Uint32Array(uvWord.buffer);
  function floatWord(value:number) {uvWord[0]=value;return uvBits[0];}
  function coordinates(key:string,mapping:SceneMapCoordinates={}) {
    if(Object.keys(mapping).some(k=>!['set','offset','scale','rotation'].includes(k)) ||
       mapping.set!==undefined && (typeof mapping.set!=='string'||!mapping.set))
      return fail('Invalid named texture coordinate mapping');
    const offset=mapping.offset??[0,0],scale=mapping.scale??[1,1],rotation=mapping.rotation??0;
    if(offset.length!==2||scale.length!==2||![...offset,...scale,rotation].every(Number.isFinite))
      return fail('Texture coordinate transform must be finite 2D scale, rotation and offset');
    const cacheKey=JSON.stringify([key,mapping.set??null,offset,scale,rotation]);
    const previous=uvStreams.get(cacheKey);
    if(previous)return previous;
    const shape=geometries.get(key)!;
    const topology='gpu' in shape?shape.uvTopology:shape;
    const source=mapping.set===undefined?topology?.texCoords:topology?.texCoordSets?.[mapping.set];
    if(!source||!topology?.indices.length||topology.indices.length%3 ||
       !('gpu' in shape) && source.length!==shape.restPositions.length)
      return fail(`Textured geometry ${key} requires its complete declared UV set`);
    const sin=Math.sin(rotation),cos=Math.cos(rotation);
    const values=source.map(uv=>{
      if(uv.length!==2||!uv.every(Number.isFinite))return fail(`Invalid UV coordinates for ${key}`);
      const x=uv[0]*scale[0],y=uv[1]*scale[1];
      const result=[Math.fround(offset[0]+cos*x-sin*y),Math.fround(offset[1]+sin*x+cos*y)] as const;
      if(!result.every(Number.isFinite))return fail('Transformed UV coordinates cannot be represented as F32');
      return result;
    });
    const record={offset:data.length,values};
    for(const index of topology.indices) {
      if(!Number.isSafeInteger(index)||index<0||index>=values.length)return fail(`Invalid UV topology for ${key}`);
      data.push(floatWord(values[index][0]),floatWord(values[index][1]));
    }
    uvStreams.set(cacheKey,record);
    return record;
  }
  const boundMaps=new Map<string,number>();
  function mapOffset(name:string|undefined,uv:number,primaryUV:number) {
    if(name===undefined)return 0;
    const original=offsets.get(name);
    if(!original)return fail(`Unknown texture region ${name}`);
    usesAtlas=true;
    if(uv===primaryUV)return original;
    const key=JSON.stringify([original,uv]);
    let mapped=boundMaps.get(key);
    if(mapped===undefined) {
      mapped=data.length;
      data.push(...data.slice(original,original+8),uv);
      boundMaps.set(key,mapped);
    }
    return mapped;
  }
  nodes.forEach((node,id)=>{
    const material=scene.materials[node.material!],key=node.geometry!,shape=geometries.get(key)!;
    const dynamic='gpu' in shape,topology=dynamic?shape.uvTopology:shape,normals=dynamic?undefined:shape.normals;
    const mappings=material.coordinates??{};
    if(Object.keys(mappings).some(k=>!['color','roughness','normal','emission','occlusion','transmission'].includes(k)))
      fail('Unknown material coordinate channel');
    let vertexColor=0;
    if(topology?.colors) {
      vertexColor=vertexColorOffsets.get(key)??0;
      if(!vertexColor) {
        const n=dynamic?shape.uvTopology!.vertexCount:shape.restPositions.length;
        if(topology.colors.length!==n||topology.colors.some(c=>c.length!==4||c.some(v=>!Number.isFinite(v)||v<0||v>1))||
            topology.indices.some(i=>!Number.isSafeInteger(i)||i<0||i>=n!))
          fail('Vertex colors require complete linear normalized RGBA and stable triangle topology');
        vertexColor=data.length;vertexColorOffsets.set(key,vertexColor);
        for(const index of topology.indices)for(const value of topology.colors[index])data.push(floatWord(value));
      }
    }
    let authoredTangent=tangentOffsets.get(key)??0;
    if(!authoredTangent&&(dynamic?shape.deformedTangents:shape.tangents)) {
      if(!topology||topology.indices.length%3)fail('Authored tangents need stable triangle topology');
      authoredTangent=data.length;tangentOffsets.set(key,authoredTangent);
      if(dynamic) {
        dynamicTangents.set(key,authoredTangent);
        for(let i=0;i<topology!.indices.length*6;i++)data.push(0);
      }else{
        const tangents=shape.tangents!;
        if(!normals||normals.length!==shape.restPositions.length||normals.some(n=>n.length!==3||!n.every(v=>Number.isFinite(Math.fround(v))))||
            topology!.indices.some(i=>!Number.isSafeInteger(i)||i<0||i>=shape.restPositions.length)||
            tangents.length!==shape.restPositions.length||tangents.some(t=>t.length!==4||
            !t.every(v=>Number.isFinite(Math.fround(v)))||Math.abs(t[3])!==1))fail('Authored XYZ/handedness tangents require matching normals');
        for(const i of topology!.indices) {
          const t=tangents[i],n=normals![i],w=t[3];
          data.push(...t.slice(0,3).map(floatWord),
            floatWord((n[1]*t[2]-n[2]*t[1])*w),floatWord((n[2]*t[0]-n[0]*t[2])*w),floatWord((n[0]*t[1]-n[1]*t[0])*w));
        }
      }
    }
    const colorName='colorMap' in material?material.colorMap:undefined;
    const roughnessName=material.kind==='pbr'?material.metallicRoughnessMap:
      material.kind==='metal'||material.kind==='dielectric'?material.roughnessMap:undefined;
    const emissionName=material.kind==='pbr'?material.emissionMap:undefined;
    const transmissionName=material.kind==='pbr'?material.transmissionMap:undefined;
    const transmissionUV=transmissionName?coordinates(key,mappings.transmission):undefined;
    const occlusionUV=material.occlusionMap?coordinates(key,mappings.occlusion):undefined;
    const colorUV=colorName?coordinates(key,mappings.color):undefined;
    const roughnessUV=roughnessName?coordinates(key,mappings.roughness):undefined;
    const normalUV=material.normalMap?coordinates(key,mappings.normal):undefined;
    const emissionUV=emissionName?coordinates(key,mappings.emission):undefined;
    const uv=(colorUV??normalUV??roughnessUV??emissionUV??occlusionUV??transmissionUV)?.offset??0;
    const color=mapOffset(colorName,colorUV?.offset??0,uv);
    const roughness=mapOffset(roughnessName,roughnessUV?.offset??0,uv);
    const normalMap=mapOffset(material.normalMap,normalUV?.offset??0,uv);
    const emissionMap=mapOffset(emissionName,emissionUV?.offset??0,uv);
    const occlusionMap=mapOffset(material.occlusionMap,occlusionUV?.offset??0,uv);
    const transmissionMap=mapOffset(transmissionName,transmissionUV?.offset??0,uv);
    const occlusionStrength=material.occlusionStrength??1;
    if(!Number.isFinite(occlusionStrength)||occlusionStrength<0||occlusionStrength>1)fail('Occlusion strength must be within [0,1]');
    if(normalMap && (dynamic&&!shape.deformedNormals || !['surface-v2','rgba32float-le'].includes(atlas?.decode??'')))
      fail('Normal maps require tangent geometry and an explicitly linear surface-v2 atlas');
    const emission=material.kind==='pbr'?material.emission??[0,0,0]:[0,0,0];
    if(emission.length!==3||emission.some(x=>!Number.isFinite(Math.fround(x))||x<0))
      fail('Expected finite nonnegative emissive RGB');
    const normalScale=material.normalScale??1;
    if(!Number.isFinite(Math.fround(normalScale)))fail('Normal-map scale must be finite');
    const alphaMode=material.alphaMode??'opaque',opacity=material.opacity??1,alphaCutoff=material.alphaCutoff??.5;
    if(!['opaque','mask','blend'].includes(alphaMode)||
        ![opacity,alphaCutoff].every(n=>Number.isFinite(n)&&n>=0&&n<=1)||
        material.doubleSided!==undefined&&typeof material.doubleSided!=='boolean')
      fail('Invalid material Alpha coverage');
    const sided=material.doubleSided===false?1:0;
    hasCoverage ||= alphaMode!=='opaque'||sided!==0;
    let shading=0;
    const tangentUV=normalUV?.offset??0;
    const shadingKey=JSON.stringify([key,tangentUV]);
    if(dynamic&&shape.deformedNormals) {
      const vertices=shape.uvTopology?.vertexCount??shape.uvTopology?.texCoords?.length??0;
      if(!Number.isSafeInteger(vertices)||vertices<3||!topology||!topology.indices.length||topology.indices.length%3||
          topology.indices.some(i=>!Number.isSafeInteger(i)||i<0||i>=vertices))
        return fail(`Invalid deformed shading topology for ${key}`);
      let entry=deformed.get(key);
      if(!entry){entry={vertices,variants:[]};deformed.set(key,entry);}
      shading=shadingOffsets.get(shadingKey)??0;
      if(!shading) {
        shading=data.length;
        shadingOffsets.set(shadingKey,shading);
        entry.variants.push({shading,tangentUV});
        for(let i=0;i<topology.indices.length/3*triangleShadingWords;i++)data.push(0);
      }
    } else if(!dynamic&&(normalMap||normals)) {
      const {indices,restPositions}=shape;
      if(!indices.length||indices.length%3||indices.some(i=>!Number.isSafeInteger(i)||i<0||i>=restPositions.length))
        fail(`Invalid normal topology for ${key}`);
      if(normals&&(normals.length!==restPositions.length||normals.some(n=>n.length!==3||!n.every(v=>Number.isFinite(Math.fround(v))))))
        fail(`Expected one finite XYZ normal per vertex for ${key}`);
      shading=shadingOffsets.get(shadingKey)??0;
      if(!shading) {
        shading=data.length;shadingOffsets.set(shadingKey,shading);
        const unitNormals=normals?.map(normal=>{
          const length=Math.hypot(...normal);
          return length?normal.map(value=>value/length):[0,0,0];
        });
        for(let i=0;i<indices.length;i+=3) {
          const [a,b,c]=[indices[i],indices[i+1],indices[i+2]];
          const n=unitNormals?[...unitNormals[a],...unitNormals[b],...unitNormals[c]]:[0,0,0,0,0,0,0,0,0];
          const tangent=normalUV?sceneTriangleTangents(restPositions,a,b,c,normalUV.values):[0,0,0,0,0,0];
          data.push(...n.map(floatWord),...tangent.map(floatWord));
        }
      }
    }
    const details=authoredTangent||occlusionMap||transmissionMap?data.length:0;
    if(details)data.push(authoredTangent,occlusionMap,floatWord(occlusionStrength),transmissionMap);
    data.splice(1+id*sceneShadingWords,sceneShadingWords,uv,color,roughness,normalMap,shading,floatWord(normalScale),
      emissionMap,...emission.map(floatWord),floatWord(opacity),['opaque','mask','blend'].indexOf(alphaMode),floatWord(alphaCutoff),sided,vertexColor,details);
  });
  const environmentRegion=scene.environment?.map===undefined?0:offsets.get(scene.environment.map);
  if(environmentRegion===undefined)fail('Unknown environment atlas region');
  let environmentOffset=0;
  if(environmentRegion) {
    usesAtlas=true;
    const importance=scene.environment?.importance??{width:1,height:1,luminance:[1]};
    const distribution=environmentDistribution(importance);
    environmentOffset=data.length;
    for(const word of distribution)data.push(word);
  } else if(scene.environment?.importance) fail('Environment importance requires an explicit map');
  return {words: Uint32Array.from(data),environmentRegion:environmentRegion!,environmentOffset,hasCoverage,dynamicTangents, hasShading: shadingOffsets.size>0 || deformed.size>0,dynamic:deformed,
    atlas: usesAtlas ? structuredClone(atlas!) : undefined};
}

export async function frameTextureAtlas(gpu: NativeStageInit['gpu'], arena: GpuResourceArena,
    atlas: SceneTextureAtlas | undefined, empty: import('../gpu-effects/compute-types.ts').GpuDataBuffer) {
  if (!atlas) return empty;
  if(atlas.decode==='rgba32float-le') {
    const bytes=atlas.width*atlas.height*16;
    if(!Number.isSafeInteger(bytes))return fail('Raw F32 atlas byte length overflows');
    const source=await gpu.importBufferResource({version:1,id:atlas.resource,profile:'raw-bytes-v1',bytes});
    return arena.buffer(source.buffer);
  }
  if (!gpu.imageToBuffer) fail('Texture sampling requires an owner-local Surface buffer view');
  const image = arena.image(await gpu.importResource({
    version: 1, id: atlas.resource, decode: atlas.decode ?? 'icc-sdr',
    missingProfile: 'assume-srgb',
    output: {width: atlas.width, height: atlas.height, format: 'rgba32float', alpha: 'straight', color: linear709},
  }));
  return arena.buffer(await gpu.imageToBuffer!(image, {version: 1}));
}

/** GPU bilinear sampling, wrapping within a region instead of bleeding into adjacent atlas tiles. */
export function sceneTextureSampling(meta:string,texel:string,storage:'f32'|'u32'='f32') {
  const read=(i:string)=>storage==='u32'?`bitcast<f32>(${texel}(${i}))`:`${texel}(${i})`;
  return /* wgsl */ `
fn sceneUV(triangle: u32, base: u32, bary: vec2f) -> vec2f {
  let i = base + triangle * 6u;
  let a = vec2f(bitcast<f32>(${meta}(i)), bitcast<f32>(${meta}(i + 1u)));
  let b = vec2f(bitcast<f32>(${meta}(i + 2u)), bitcast<f32>(${meta}(i + 3u)));
  let c = vec2f(bitcast<f32>(${meta}(i + 4u)), bitcast<f32>(${meta}(i + 5u)));
  return a * (1. - bary.x - bary.y) + b * bary.x + c * bary.y;
}
fn addressTexel(p:i32,size:i32,mode:u32)->i32 {
  if(mode==0u){return clamp(p,0,size-1);}
  if(mode==1u){return ((p%size)+size)%size;}
  let period=size*2;let i=((p%period)+period)%period;
  return min(i,period-1-i);
}
fn addressUV(v:f32,mode:u32)->f32 {
  if(mode==0u){return clamp(v,0.,1.);}
  if(mode==1u){return fract(v);}
  let t=v-2.*floor(v*.5);return min(t,2.-t);
}
fn sceneTexel(p:vec2i,dims:vec2i,origin:vec2u,stride:u32,wrap:vec2u)->vec4f {
  let xy=vec2u(u32(addressTexel(p.x,dims.x,wrap.x)),u32(addressTexel(p.y,dims.y,wrap.y)));
  let at=(origin.x+xy.x+(origin.y+xy.y)*stride)*4u;
  return vec4f(${read('at')},${read('at+1u')},${read('at+2u')},${read('at+3u')});
}
fn sceneTexture(region: u32, uv: vec2f) -> vec4f {
  if (region == 0u) { return vec4f(1.); }
  let origin = vec2u(${meta}(region), ${meta}(region + 1u));
  let size = vec2i(i32(${meta}(region + 2u)), i32(${meta}(region + 3u)));
  let wrap=vec2u(${meta}(region+4u),${meta}(region+5u));
  let stride=${meta}(region+7u);
  let unit=vec2f(addressUV(uv.x,wrap.x),addressUV(uv.y,wrap.y));
  let q=unit*vec2f(size)-.5;
  if(${meta}(region+6u)!=0u){return sceneTexel(vec2i(floor(q+.5)),size,origin,stride,wrap);}
  let p=vec2i(floor(q));let f=fract(q);
  return mix(
    mix(sceneTexel(p,size,origin,stride,wrap),sceneTexel(p+vec2i(1,0),size,origin,stride,wrap),f.x),
    mix(sceneTexel(p+vec2i(0,1),size,origin,stride,wrap),sceneTexel(p+1,size,origin,stride,wrap),f.x),f.y);
}
fn sceneTextureAt(region:u32,triangle:u32,bary:vec2f,primaryUV:vec2f)->vec4f {
  if(region==0u){return vec4f(1.);}
  let base=${meta}(region+8u);
  var uv=primaryUV;
  if(base!=0u){uv=sceneUV(triangle,base,bary);}
  return sceneTexture(region,uv);
}
`;
}
