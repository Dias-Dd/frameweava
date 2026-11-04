import {createNativeInstancedMeshRenderer,type MeshData} from '../skeletal-effects/native.ts';
import {checkCreationLighting,sampleLighting} from './studio-lighting.ts';
import {validateMeshData} from '../graphics-contracts/validate.ts';
import {withGpuResources} from '../gpu-effects/resource-arena.ts';
import type {CreationInit} from './types.ts';
import {creationStage,validateCreation,material,materialKeys,fail} from './lifecycle.ts';
import {assetNumber} from './physics-assets.ts';
import {primitiveAsset,primitivePlan,type PrimitiveKind,type ShapeGeometry} from './primitive-assets.ts';
import {checkObjectCamera,objectCamera,objectModel,objectTransformKeys} from './object-controls.ts';
import {sculptureMaterials,sculptureLighting,type SculptureView,type ObjectStyle} from './sculptures.ts';
import {cloneCount,checkCloneMotion,sampleCloneLayout,cloneMotionKeys,type CloneMotion,type CloneLayout,type LineCloneLayout,type GridCloneLayout,type RadialCloneLayout,type SphereCloneLayout,type ScatterCloneLayout,type HelixCloneLayout,type SpiralCloneLayout,type HoneycombCloneLayout,type WaveCloneLayout} from './clone-layout.ts';
import {gradientBackground,stackCreations,type GradientBackgroundOptions} from './composition.ts';
export type * from './clone-layout.ts';
export type CloneSource={shape?:'icosahedron';geometry?:ShapeGeometry<'icosahedron'>;asset?:never}|{[K in Exclude<PrimitiveKind,'icosahedron'>]:{shape:K;geometry?:ShapeGeometry<K>;asset?:never}}[Exclude<PrimitiveKind,'icosahedron'>]|{asset:MeshData;shape?:never;geometry?:never};
export interface CloneStyle extends SculptureView,ObjectStyle,CloneMotion {seed?:number}
export type CloneOptions=CloneStyle&CloneSource;
export type Clones3DOptions=CloneOptions&{layout:CloneLayout};
export type CloneSceneOptions=CloneOptions&{layout?:CloneLayout;background?:false|Omit<GradientBackgroundOptions,'format'|'post'|'signal'|'finish'>};
const keys=['camera','lighting','normals','maxBytes','maxRayTests','maxValueBytes','maxLights','material',...materialKeys,...objectTransformKeys,...cloneMotionKeys,'seed','shape','geometry','asset'];
function snapshot<T extends CloneStyle>(o:T):T{const {post,signal,...rest}=o;try{return {...structuredClone(rest),post,signal} as T;}catch{fail('Clone options require serializable values and Core Signals');}}
function preflight(init:CreationInit,o:Clones3DOptions,count:number){
 const budget=assetNumber(o.maxValueBytes??64*1024**2,'maxValueBytes',1),shape=o.shape??'icosahedron';let baseBytes:number;
 if(o.asset!==undefined){if(o.shape!==undefined||o.geometry!==undefined)fail('Choose custom asset or primitive shape');baseBytes=(o.asset.restPositions?.length??0)*128+(o.asset.indices?.length??0)*8;}else baseBytes=primitivePlan(shape,o.geometry,budget).plannedBytes;
 if(!Number.isSafeInteger(baseBytes+count*1024+(o.palette?.length??0)*64)||baseBytes+count*1024>budget)fail('Complete clone attribute/capacity value plan exceeds maxValueBytes','E_CREATION_BUDGET');
 let mesh=o.asset===undefined?primitiveAsset('creation.clones',shape,o.geometry,budget):validateMeshData(o.asset);
 if(mesh.material?.texture)fail('Clone texture needs an explicit existing texture adapter','E_CREATION_OBJECT_MATERIAL');if(mesh.material?.baseColor&&o.ink===undefined)fail('sRGB baseColor needs explicit scene-linear ink','E_CREATION_OBJECT_MATERIAL');const {material:ignored,...plain}=mesh;mesh={...plain,id:'creation.clones'};
 const triangles=mesh.indices.length/3,work=init.width*init.height*triangles*count,bytes=init.width*init.height*16+triangles*72+count*(triangles*120+1024)+mesh.vertexIds.length*256+mesh.indices.length*8+JSON.stringify(mesh).length*2+(o.maxLights??64)*512;
 if(!Number.isSafeInteger(work)||work>(o.maxRayTests??2e9)||!Number.isSafeInteger(bytes)||bytes>(o.maxBytes??512*1024**2))fail('Complete clone geometry/ray plan exceeds maxBytes/maxRayTests; raise the explicit budget or reduce authored detail/count','E_CREATION_BUDGET');return mesh;
}
export async function clones3D(init:CreationInit,options:Clones3DOptions){
 validateCreation(init,options,[...keys,'layout']);const o=snapshot(options),count=cloneCount(o.layout),seed=o.seed??init.seed;
 if(!Number.isInteger(seed)||seed<0||seed>0xffffffff)fail('Clone seed must be uint32');checkCloneMotion(o);checkObjectCamera(o.camera);checkCreationLighting(o.lighting);
 if(o.material!==undefined&&!Object.hasOwn(sculptureMaterials,o.material))fail('Unknown clone material');if(o.normals!==undefined&&!['flat','smooth'].includes(o.normals))fail('Normals must be flat or smooth');
 const mesh=preflight(init,o,count);
 return withGpuResources(init.gpu,async a=>{const draw=a.adopt(await createNativeInstancedMeshRenderer(init.gpu,[{mesh,capacity:Math.max(1,count)}],{width:init.width,height:init.height,shading:'standard',normals:o.normals??'smooth',side:'double',maxBytes:o.maxBytes,maxRayTests:o.maxRayTests,maxLights:o.maxLights}),r=>r.dispose());
  const stage=creationStage(init,o,async c=>{const model=objectModel(o,c);return draw.render({context:c,camera:objectCamera(o.camera,c),objects:[{id:mesh.id,...model,instances:sampleCloneLayout(o.layout,o,seed,c),appearance:material({...sculptureMaterials[o.material??'ceramic'],...o},c)}],lighting:sampleLighting(o.lighting,c,sculptureLighting),format:o.format??'rgba32float',signal:o.signal});},()=>draw.dispose(),()=>({kind:'clones',layout:o.layout.kind,count,seed,sourceTriangles:mesh.indices.length/3,renderer:draw.stats(),motion:'CPU control attributes; original Native GPU expansion/visibility/shading; absolute FrameContext'}));a.keep(draw);return stage;
 });
}
function layout<L extends object>(init:CreationInit,o:CloneOptions&L,kind:CloneLayout['kind'],fields:readonly string[]){
 validateCreation(init,o,[...keys,...fields]);const selected=Object.fromEntries(fields.filter(k=>Object.hasOwn(o,k)).map(k=>[k,(o as any)[k]])),rest=Object.fromEntries(Object.entries(o).filter(([k])=>!fields.includes(k)));return clones3D(init,{...rest,layout:{kind,...selected}} as Clones3DOptions);
}
export function lineClones(init:CreationInit,o:CloneOptions&LineCloneLayout={}){return layout(init,o,'line',['count','step']);}
export function gridClones(init:CreationInit,o:CloneOptions&GridCloneLayout={}){return layout(init,o,'grid',['grid','spacing']);}
export function radialClones(init:CreationInit,o:CloneOptions&RadialCloneLayout={}){return layout(init,o,'radial',['count','radius']);}
export function sphereClones(init:CreationInit,o:CloneOptions&SphereCloneLayout={}){return layout(init,o,'sphere',['count','radius']);}
export function scatterClones(init:CreationInit,o:CloneOptions&ScatterCloneLayout={}){return layout(init,o,'scatter',['count','bounds']);}
export function helixClones(init:CreationInit,o:CloneOptions&HelixCloneLayout={}){return layout(init,o,'helix',['count','radius','height','turns']);}
export function spiralClones(init:CreationInit,o:CloneOptions&SpiralCloneLayout={}){return layout(init,o,'spiral',['count','radius','turns']);}
export function honeycombClones(init:CreationInit,o:CloneOptions&HoneycombCloneLayout={}){return layout(init,o,'honeycomb',['grid','spacing']);}
export function waveClones(init:CreationInit,o:CloneOptions&WaveCloneLayout={}){return layout(init,o,'wave',['grid','spacing','amplitude','phase','speed','spread']);}
export async function cloneScene(init:CreationInit,options:CloneSceneOptions={}){
 validateCreation(init,options,[...keys,'layout','background']);if(options.asset?.material?.baseColor&&options.ink===undefined)fail('sRGB baseColor needs explicit scene-linear ink','E_CREATION_OBJECT_MATERIAL');const o=snapshot(options),parts=[];
 try{const {background,post,finish,...rest}=o;const source=o.asset!==undefined||o.shape!==undefined||o.geometry!==undefined?{}:{shape:'box' as const,geometry:{size:[.9,.9,.9] as const}};parts.push(await clones3D(init,{...source,size:.29,ink:[1,1,1],metalness:.2,roughness:.28,palette:[[.04,.5,.66],[.85,.23,.06],[.95,.6,.15]],cloneRotation:[12,18,0],...rest,camera:o.camera??{orbit:{radius:7,azimuth:16,elevation:10,speed:4},viewHeight:2.6},layout:o.layout??{kind:'wave',grid:[7,5,1],spacing:[.42,.42,.42],amplitude:.24,speed:2.4},finish:false} as Clones3DOptions));if(background!==false)parts.unshift(gradientBackground(init,{center:[.055,.085,.11],edge:[.004,.01,.023],...background,format:o.format,signal:o.signal}));return await stackCreations(init,parts,{format:o.format,finish:finish??{vignette:.12},post,signal:o.signal});}catch(e){await Promise.allSettled(parts.map(p=>p.dispose?.()));throw e;}
}
