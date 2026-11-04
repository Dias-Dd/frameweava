import {Matrix4} from 'three';
import {materialStyles,type CreationMaterialPreset} from './material-presets.ts';
import {lightingDefaults,checkCreationLighting,sampleLighting,type CreationLighting} from './studio-lighting.ts';
import {createNativeMeshRenderer,type MeshData,type MeshDraw,type MeshLighting} from '../skeletal-effects/native.ts';
import {validateMeshData} from '../graphics-contracts/validate.ts';
import {withGpuResources} from '../gpu-effects/resource-arena.ts';
import type {CreationInit,CreationOptions,MaterialOptions} from './types.ts';
import {creationStage,validateCreation,material,materialKeys,fail} from './lifecycle.ts';
import {assetOptions,assetNumber} from './physics-assets.ts';
import {primitiveAsset,primitivePlan,primitiveGeometryKeys,type PrimitiveGeometry,type PrimitiveKind,type ShapeGeometry} from './primitive-assets.ts';
import {checkObjectCamera,objectCamera,objectModel,objectTransformKeys,type CreationCamera,type ObjectCamera,type ObjectTransform} from './object-controls.ts';
import {gradientBackground,stackCreations,type GradientBackgroundOptions} from './composition.ts';
export type {PrimitiveKind,PrimitiveGeometry,ShapeGeometry} from './primitive-assets.ts';
export type {ObjectCamera,ObjectCameraConfig,CreationCamera,ObjectTransform,ObjectOrbit} from './object-controls.ts';

export type SculptureMaterial=CreationMaterialPreset;
export interface ObjectStyle extends MaterialOptions,ObjectTransform {material?:SculptureMaterial}
export interface SculptureView extends CreationOptions {camera?:CreationCamera;lighting?:CreationLighting;normals?:'smooth'|'flat';maxBytes?:number;maxRayTests?:number;maxValueBytes?:number;maxLights?:number}
export interface Primitive3DOptions extends SculptureView,ObjectStyle,PrimitiveGeometry {}
export type PrimitiveOptions<K extends keyof PrimitiveGeometry>=Omit<Primitive3DOptions,keyof PrimitiveGeometry>&Pick<PrimitiveGeometry,K>;
export interface Mesh3DOptions extends SculptureView,ObjectStyle {asset:MeshData}
/** Ordinary TS configuration over existing Graphics MeshData and MeshDraw; no graph/DSL. */
export type SculptureObject=ObjectStyle&({[K in PrimitiveKind]:{shape:K;geometry?:ShapeGeometry<K>}}[PrimitiveKind]|{asset:MeshData;shape?:never;geometry?:never});
export interface SculptureSceneOptions extends SculptureView,ObjectTransform {objects?:readonly SculptureObject[];background?:false|Omit<GradientBackgroundOptions,'format'|'post'|'signal'|'finish'>}
export const sculptureMaterials=materialStyles;
export const sculptureLighting:MeshLighting=lightingDefaults('studio');
const viewKeys=['camera','lighting','normals','maxBytes','maxRayTests','maxValueBytes','maxLights'],styleKeys=['material',...materialKeys,...objectTransformKeys];
function snap<T extends CreationOptions>(o:T):T{const {post,signal,...rest}=o;try{return {...structuredClone(rest),post,signal} as T;}catch{fail('Sculpture options need plain data and Core Signals');}}
function style(o:ObjectStyle){if(o.material!==undefined&&!Object.hasOwn(sculptureMaterials,o.material))fail('Unknown sculpture material');return {...sculptureMaterials[o.material??'ceramic'],...o};}
function checkView(o:SculptureView){checkObjectCamera(o.camera);checkCreationLighting(o.lighting);if(o.normals!==undefined&&!['smooth','flat'].includes(o.normals))fail('Normals must be smooth or flat');}
function objectAsset(o:SculptureObject,i:number,budget:number){
 assetOptions(o,[...styleKeys,...('asset'in o?['asset']:['shape','geometry'])],'sculpture object');style(o);
 let mesh:MeshData;if('asset'in o){mesh=validateMeshData(o.asset);if(mesh.material?.texture)fail('Custom textured meshes need their explicit existing texture adapter','E_CREATION_OBJECT_MATERIAL');if(mesh.material?.baseColor&&o.ink===undefined)fail('sRGB baseColor needs explicit scene-linear ink','E_CREATION_OBJECT_MATERIAL');}
 else mesh=primitiveAsset('creation.object.'+i,o.shape,o.geometry,budget);
 const {material:ignored,...plain}=mesh;return {...plain,id:'creation.object.'+i};
}
function plan(init:CreationInit,o:SculptureView,objects:readonly SculptureObject[]){
 const budget=assetNumber(o.maxValueBytes??64*1024**2,'maxValueBytes',1);let bytes=0;
 for(const p of objects){if('asset'in p){const m=p.asset;bytes+=(m?.restPositions?.length??0)*128+(m?.indices?.length??0)*8;}else bytes+=primitivePlan(p.shape,p.geometry,budget).plannedBytes;}
 if(!Number.isSafeInteger(bytes)||bytes>budget||bytes+init.width*init.height*16>(o.maxBytes??512*1024**2))fail('Complete scene geometry exceeds explicit budget','E_CREATION_BUDGET');return budget;
}
async function recordObjects(init:CreationInit,o:SculptureView,objects:readonly SculptureObject[],root:ObjectTransform={}){
 checkView(o);const budget=plan(init,o,objects),meshes=objects.map((p,i)=>objectAsset(p,i,budget));
 return withGpuResources(init.gpu,async a=>{const draw=a.adopt(await createNativeMeshRenderer(init.gpu,meshes,{width:init.width,height:init.height,shading:'standard',normals:o.normals??'smooth',side:'double',maxBytes:o.maxBytes,maxRayTests:o.maxRayTests,maxLights:o.maxLights}),x=>x.dispose());
  const stage=creationStage(init,o,async c=>{const parent=objectModel(root,c),objectsToDraw=objects.map((p,i):MeshDraw=>{const local=objectModel(p,c),model=new Matrix4().fromArray(parent.model).multiply(new Matrix4().fromArray(local.model)).elements;return {id:meshes[i].id,model,visible:local.visible&&parent.visible,appearance:material(style(p),c)};});return draw.render({context:c,camera:objectCamera(o.camera,c),objects:objectsToDraw,lighting:sampleLighting(o.lighting,c,sculptureLighting),format:o.format??'rgba32float',signal:o.signal});},()=>draw.dispose(),()=>({kind:'sculpture',objects:meshes.length,renderer:draw.stats(),coordinates:'meters / right-handed / +Y up / Euler XYZ degrees',motion:'absolute FrameContext; spin degrees per second; no state history'}));a.keep(draw);return stage;
 });
}
function primitive(init:CreationInit,options:Primitive3DOptions,shape:PrimitiveKind){
 validateCreation(init,options,[...viewKeys,...styleKeys,...primitiveGeometryKeys]);const o=snap(options),geometry=Object.fromEntries(primitiveGeometryKeys.filter(k=>Object.hasOwn(o,k)).map(k=>[k,(o as any)[k]]));
 return recordObjects(init,o,[{...Object.fromEntries(styleKeys.filter(k=>Object.hasOwn(o,k)).map(k=>[k,(o as any)[k]])),shape,geometry}]);
}
export function box3D(init:CreationInit,o:PrimitiveOptions<'size'>={}){return primitive(init,o,'box');}
export function sphere3D(init:CreationInit,o:PrimitiveOptions<'radius'|'detail'>={}){return primitive(init,o,'sphere');}
export function torus3D(init:CreationInit,o:PrimitiveOptions<'radius'|'tube'|'detail'>={}){return primitive(init,o,'torus');}
export function cylinder3D(init:CreationInit,o:PrimitiveOptions<'radius'|'height'|'detail'>={}){return primitive(init,o,'cylinder');}
export function cone3D(init:CreationInit,o:PrimitiveOptions<'radius'|'height'|'detail'>={}){return primitive(init,o,'cone');}
export function capsule3D(init:CreationInit,o:PrimitiveOptions<'radius'|'height'|'detail'>={}){return primitive(init,o,'capsule');}
export function knot3D(init:CreationInit,o:PrimitiveOptions<'radius'|'tube'|'detail'>={}){return primitive(init,o,'knot');}
export function icosahedron3D(init:CreationInit,o:PrimitiveOptions<'radius'|'detail'>={}){return primitive(init,o,'icosahedron');}
export function mesh3D(init:CreationInit,options:Mesh3DOptions){validateCreation(init,options,[...viewKeys,...styleKeys,'asset']);const o=snap(options);return recordObjects(init,o,[{asset:o.asset,...Object.fromEntries(styleKeys.filter(k=>Object.hasOwn(o,k)).map(k=>[k,(o as any)[k]]))}]);}
export async function sculptureScene(init:CreationInit,options:SculptureSceneOptions={}){
 validateCreation(init,options,[...viewKeys,...objectTransformKeys,'objects','background']);const o=snap(options),objects=o.objects??[
  {shape:'torus',geometry:{radius:.78,tube:.21},material:'copper',position:[-.58,.1,.1],rotation:[32,15,18],spin:[0,18,0]},
  {shape:'sphere',geometry:{radius:.42},material:'ceramic',position:[.7,.42,-.15],spin:[0,-20,0]},
  {shape:'icosahedron',geometry:{radius:.36},material:'chrome',position:[.48,-.58,.35],rotation:[18,30,0],spin:[0,24,8]},
 ] as const;
 if(!Array.isArray(objects)||objects.length===0)fail('sculptureScene needs a nonempty objects array');
 const parts=[];try{parts.push(await recordObjects(init,{...o,post:undefined,finish:false,camera:o.camera??{orbit:{radius:7,azimuth:18,elevation:14,speed:7}}},objects,o));if(o.background===false)return await stackCreations(init,parts,{format:o.format,finish:o.finish,post:o.post,signal:o.signal});parts.unshift(gradientBackground(init,{center:[.065,.09,.105],edge:[.006,.012,.025],...o.background,format:o.format,signal:o.signal}));return await stackCreations(init,parts,{format:o.format,finish:o.finish??{vignette:.16},post:o.post,signal:o.signal});}catch(e){await Promise.allSettled(parts.map(p=>p.dispose?.()));throw e;}
}
