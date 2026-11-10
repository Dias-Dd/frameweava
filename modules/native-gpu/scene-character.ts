import {Matrix4 as ThreeMatrix4} from 'three';
import {EngineError} from '../../src/core/errors.ts';
import type {FrameContext} from '../../src/core/types.ts';
import type {GpuDataBuffer} from '../gpu-effects/compute-types.ts';
import type {GpuResourceArena} from '../gpu-effects/resource-arena.ts';
import {characterDocument,createCharacterAnimator} from '../spatial-creation/character-animation.ts';
import {createCharacterRenderer} from '../spatial-creation/character-renderer.ts';
import type {CharacterAnimationControls,CharacterSample,Matrix4} from '../spatial-creation/character-assets.ts';
import type {NativeStageInit} from './authoring.ts';
import {sceneRead,sceneWrite,type NativeScene3D,type SceneGeometry,type SceneGpuMesh,type SceneMaterial,type SceneNode,
  type SceneRgb,type SceneTransform} from './scene.ts';

export interface NativeSceneCharacterOptions {
  id: string;
  maxBytes?:number;
  maxWork?:number;
  parent?: string;
  transform?: SceneTransform;
  controls?: CharacterAnimationControls;
  /** Map declared character image IDs to regions in the scene texture atlas. */
  textures?: Readonly<Record<string,string>>;
  /** Channel-specific regions allow one image to be decoded as color and as data. */
  materialTextures?:Readonly<Record<string,Partial<Record<'color'|'roughness'|'normal'|'emission'|'occlusion'|'transmission',string>>>>;
}

const unpackDeformation = /* wgsl */ `
fn compute(p:vec3u,local:vec3u,group:vec3u) {
  let packed=(paramU32(0u)+p.x)*6u;
  let xyz=p.x*3u;
  for(var axis=0u;axis<3u;axis++) {
    store1(xyz+axis,load0(packed+axis));
    store2(xyz+axis,load0(packed+3u+axis));
  }
}
`;

const fail=(message:string):never=>{throw new EngineError('E_NATIVE_SCENE_CHARACTER',message);};

function rayTransform(m:Matrix4):SceneTransform {
  return [m[0],m[4],m[8],m[12],m[1],m[5],m[9],m[13],m[2],m[6],m[10],m[14]];
}

/** Add an imported character to the shared Native scene without rasterizing it
 * first. Both renderers see the same triangles, materials and sampled pose. */
export async function attachNativeCharacter(init:NativeStageInit,scene:NativeScene3D,document:unknown,
    options:NativeSceneCharacterOptions):Promise<{scene:NativeScene3D;dispose():Promise<void>}> {
  if(!options.id || scene.nodes.some(n=>n.id===options.id)) fail('Character root ID must be unique and nonempty');
  const budgets={maxBytes:options.maxBytes,maxWork:options.maxWork};
  const animator=await createCharacterAnimator(characterDocument(document,budgets),budgets);
  let deformer:Awaited<ReturnType<typeof createCharacterRenderer>>|undefined;
  try {
    const {asset}=animator.describe();
    const {gpu}=init;
    const geometries:Record<string,SceneGeometry>={...scene.geometries};
    const materials:Record<string,SceneMaterial>={...scene.materials};
    const nodes:SceneNode[]=[...scene.nodes,{id:options.id,parent:options.parent,transform:options.transform}];
    const root=options.id+'/';
    const nodeIndex=new Map(asset.nodes.map((node,index)=>[node.id,index]));
    const rigid=new Map<string,number>();
    const instancedDeformations:{id:string;node:number;matrix:Matrix4}[]=[];
    const needsDeformation=asset.primitives.some(primitive=>primitive.skin || primitive.morphs.length);
    const kernel=needsDeformation?await gpu.compileCompute({
      abiVersion:1,id:'frameweave/scene/character-xyz-normal',version:'1.0.0',
      bindings:[sceneRead,sceneWrite,sceneWrite],parameterWords:1,workgroupSize:[64,1,1],code:unpackDeformation,
    }):undefined;
    if(needsDeformation) deformer=await createCharacterRenderer(gpu,asset,{width:1,height:1,...budgets});
    const tangentKernel=needsDeformation&&asset.primitives.some(p=>p.tangents)?await gpu.compileCompute({
      abiVersion:1,id:'frameweave/scene/character-tangent-slice',version:'1.0.0',
      bindings:[sceneRead,sceneWrite],parameterWords:1,workgroupSize:[64,1,1],code:
        'fn compute(p:vec3u,l:vec3u,g:vec3u){for(var c=0u;c<6u;c++){store1(p.x*6u+c,load0((paramU32(0u)+p.x)*6u+c));}}',
    }):undefined;
    const tangentFrames=new WeakMap<GpuResourceArena,WeakMap<FrameContext,Promise<GpuDataBuffer>>>();
    const packedFrames=new WeakMap<GpuResourceArena,WeakMap<FrameContext,Promise<GpuDataBuffer>>>();
    let sampled:FrameContext|undefined,pose:CharacterSample;
    function sample(context:FrameContext) {
      if(sampled!==context) {
        pose=animator.sample(context,options.controls);
        sampled=context;
      }
      return pose;
    }
    let offset=0;
    for(const primitive of asset.primitives) {
      const id=root+primitive.id;
      if(id in geometries || id in materials || nodes.some(node=>node.id===id)) fail('Duplicate scene character primitive '+id);
      const {material:m,mesh}=primitive;
      const transmissionExtension=m.extensions?.KHR_materials_transmission as {transmissionTexture?:unknown}|undefined;
      if(transmissionExtension?.transmissionTexture&&!m.transmissionTexture)
        fail('Reimport the character to retain its declared transmission texture');
      const color:SceneRgb=[m.color[0],m.color[1],m.color[2]];
      const supported=new Set(['normalTexture','metallicRoughnessTexture','emissiveTexture','occlusionTexture','transmissionTexture']);
      const unsupported=(m.unsupportedMaps??[]).filter(name=>!['extension:KHR_materials_transmission','extension:KHR_materials_ior'].includes(name)&&(!supported.has(name)||!(m as unknown as Record<string,unknown>)[name]));
      if(unsupported.length)
        fail('Unsupported character material on '+primitive.id+': '+unsupported.join(', '));
      const channels=[
        ['color',m.texture],['roughness',m.metallicRoughnessTexture],['normal',m.normalTexture],['emission',m.emissiveTexture],['occlusion',m.occlusionTexture],['transmission',m.transmissionTexture],
      ] as const;
      const maps:Partial<Record<typeof channels[number][0],string>>={};
      const coordinates:NonNullable<SceneMaterial['coordinates']>={};
      for(const [channel,texture] of channels) {
        if(!texture)continue;
        const name=options.materialTextures?.[m.id]?.[channel]??options.textures?.[texture.image];
        const region=name?scene.textureAtlas?.regions[name]:undefined;
        const uv=primitive.uvSets?.[String(texture.texCoord)];
        if(!region || !uv || texture.wrapS!==(region.addressU??region.wrap??'clamp') ||
            texture.wrapT!==(region.addressV??region.wrap??'clamp') || texture.filter!==(region.filter??'linear'))
          fail('Character texture requires a matching declared atlas sampler and UV set: '+texture.image);
        maps[channel]=name;
        coordinates[channel]={set:String(texture.texCoord),offset:texture.offset,scale:texture.scale,rotation:texture.rotation};
      }
      materials[id]=m.unlit?{kind:'unlit',color,colorMap:maps.color}:
        {kind:'pbr',color,colorMap:maps.color,roughness:m.roughness,metallic:m.metalness,emission:m.emissive,
          transmission:m.transmission??(m.extensions?.KHR_materials_transmission as {transmissionFactor?:number}|undefined)?.transmissionFactor??0,
          ior:m.ior??(m.extensions?.KHR_materials_ior as {ior?:number}|undefined)?.ior??1.5,transmissionMap:maps.transmission,
          metallicRoughnessMap:maps.roughness,normalMap:maps.normal,normalScale:m.normalScale,emissionMap:maps.emission};
      materials[id].coordinates=coordinates;
      materials[id].occlusionMap=maps.occlusion;materials[id].occlusionStrength=m.occlusionStrength;
      Object.assign(materials[id],{alphaMode:m.alphaMode,opacity:m.color[3],alphaCutoff:m.alphaCutoff,doubleSided:m.doubleSided});
      const count=mesh.vertexIds.length,start=offset;
      offset+=count;
      const deforms=primitive.skin || primitive.morphs.length;
      if(primitive.instances) {
        if(!deforms) {
          nodes.push({id,parent:options.id});
          rigid.set(id,nodeIndex.get(primitive.node)!);
        }
        for(const instance of primitive.instances) {
          const name=id+'/'+instance.id;
          nodes.push({id:name,parent:deforms?options.id:id,geometry:id,material:id,transform:rayTransform(instance.matrix)});
          if(deforms)instancedDeformations.push({id:name,node:nodeIndex.get(primitive.node)!,matrix:instance.matrix});
        }
      } else nodes.push({id,parent:options.id,geometry:id,material:id});
      if(deforms) {
        geometries[id]={
          deformedNormals:true,deformedTangents:!!primitive.tangents,uvTopology:{indices:mesh.indices,texCoordSets:primitive.uvSets,colors:primitive.colors,vertexCount:count},
          async gpu(context,arena):Promise<SceneGpuMesh> {
            let contexts=packedFrames.get(arena);
            if(!contexts) {
              contexts=new WeakMap();
              packedFrames.set(arena,contexts);
            }
            let packed=contexts.get(context);
            if(!packed) {
              packed=deformer!.deform(sample(context)).then(value=>arena.buffer(value));
              contexts.set(context,packed);
            }
            const vertices=await packed;
            const positions=arena.buffer(await gpu.createField({
              type:'f32',dimensions:[count,1,1],components:3,semantic:'position',space:'world',units:'meter',
            }));
            const normals=arena.buffer(await gpu.createBuffer({type:'f32',length:count*3}));
            await gpu.dispatch(kernel!,[vertices,positions,normals],{parameters:Uint32Array.of(start),workItems:[count,1,1]});
            let tangents:GpuDataBuffer|undefined;
            if(primitive.tangents){
              let frames=tangentFrames.get(arena);
              if(!frames){frames=new WeakMap();tangentFrames.set(arena,frames);}
              let pending=frames.get(context);
              if(!pending){pending=deformer!.deformTangents(sample(context)).then(v=>arena.buffer(v));frames.set(context,pending);}
              const packed=await pending;
              tangents=arena.buffer(await gpu.createBuffer({type:'f32',length:count*6}));
              await gpu.dispatch(tangentKernel!,[packed,tangents],{parameters:Uint32Array.of(start),workItems:[count,1,1]});
            }
            return {positions,normals,tangents};
          },
        };
      } else {
        geometries[id]={restPositions:mesh.restPositions,indices:mesh.indices,normals:primitive.normals,texCoordSets:primitive.uvSets,colors:primitive.colors,tangents:primitive.tangents};
        if(!primitive.instances)rigid.set(id,nodeIndex.get(primitive.node)!);
      }
    }
    return {
      scene:{...scene,geometries,materials,nodes,sample(context){
        const frame=scene.sample(context);
        if(!rigid.size&&!instancedDeformations.length)return frame;
        const matrices=sample(context).globalMatrices;
        const transforms={...frame.transforms};
        for(const [id,index] of rigid) transforms[id]=rayTransform(matrices[index]);
        for(const instance of instancedDeformations) {
          const node=new ThreeMatrix4().fromArray(matrices[instance.node]);
          const world=node.clone().multiply(new ThreeMatrix4().fromArray(instance.matrix)).multiply(node.clone().invert());
          transforms[instance.id]=rayTransform(world.elements as Matrix4);
        }
        return {...frame,transforms};
      }},
      async dispose() {
        try{await deformer?.dispose();}finally{animator.dispose();}
      },
    };
  } catch(error) {
    try{await deformer?.dispose();}finally{animator.dispose();}
    throw error;
  }
}
