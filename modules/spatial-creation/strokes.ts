import {creationColor} from './colors.ts';
import {createTrailGeometry,createNativeMeshRenderer} from '../skeletal-effects/native.ts';
import {withGpuResources} from '../gpu-effects/resource-arena.ts';
import type {TrailGeometry,MeshDraw,MeshData,Vec3} from '../skeletal-effects/native.ts';
import type {Signal,FrameContext} from '../../src/core/types.ts';
import type {CreationInit,CreationOptions,CameraOptions,MaterialOptions,AnimatedVec3} from './types.ts';
import {creationStage,validateCreation,scalar,vector,material,defaultCamera,materialKeys,fail} from './lifecycle.ts';
import {shapeCount,shapePoints,type StrokeShapeOptions,type StrokeShape} from './stroke-shapes.ts';
export interface StrokeAppearance extends CreationOptions,CameraOptions,MaterialOptions {
 shading?:'standard'|'unlit';maxBytes?:number;maxWork?:number;maxRayTests?:number;
}
export interface StrokeGeometryOptions {kind?:'tube'|'ribbon';radialSegments?:number;maxVerticesPerMesh?:number;caps?:boolean;closed?:boolean;firstNormal?:Vec3}
export interface Stroke3DOptions extends StrokeAppearance,StrokeGeometryOptions {
 points:readonly AnimatedVec3[];
 /** Tube radius / ribbon half width. Scalar or one Core Signal per station. */
 thickness?:Signal<number>|readonly Signal<number>[];twist?:Signal<number>;
}
export interface NeonShapeOptions extends StrokeAppearance,Omit<StrokeGeometryOptions,'closed'|'caps'>,StrokeShapeOptions {thickness?:Signal<number>;twist?:Signal<number>;count?:number}
export const strokeAppearanceKeys=['camera','shading',...materialKeys,'maxBytes','maxWork','maxRayTests'];
const geometryKeys=['kind','radialSegments','maxVerticesPerMesh','caps','closed','firstNormal'],shapeKeys=['segments','radius','length','turns','phase','speed','center','rotation','thickness','twist','count'];
export function strokeSnapshot<T extends CreationOptions>(o:T):T{const {post,signal,...rest}=o;try{return {...structuredClone(rest),post,signal} as T;}catch{fail('Stroke options need serializable values and Core Signals');}}
export function strokeCamera(init:CreationInit){return {...defaultCamera,position:[0,0,6] as Vec3,viewHeight:Math.max(3.4,4/(init.width/init.height))};}
export function strokeAppearance(o:StrokeAppearance,c:FrameContext){return o.shading==='standard'?material(o,c):{color:creationColor(o.ink??[.15,2.4,3.8],c,'ink'),opacity:scalar(o.opacity??1,c,'opacity',0,1)};}
export function checkStrokeAppearance(o:StrokeAppearance){if(o.shading!==undefined&&!['unlit','standard'].includes(o.shading))fail('Stroke shading must be unlit or standard');if(o.shading!=='standard'&&['emissive','roughness','metalness'].some(k=>o[k as keyof StrokeAppearance]!==undefined))fail('Unlit strokes use ink/opacity; select shading:standard for lit material controls');}
export const neonFinish={glow:{radius:3,intensity:.65,threshold:.5}} as const;
/** Shared lifetime helper over the ORIGINAL renderer; creates no owner. */
export async function geometryCreator(init:CreationInit,o:StrokeAppearance,geometries:{meshes:MeshData[];describe():unknown;dispose():void}[],sample:(c:FrameContext)=>MeshDraw[],kind:string){
 return withGpuResources(init.gpu,async a=>{const meshOwner=a.adopt({geometries},owner=>{for(const g of owner.geometries)g.dispose();}),draw=a.adopt(await createNativeMeshRenderer(init.gpu,geometries.flatMap(g=>g.meshes),{width:init.width,height:init.height,shading:o.shading??'unlit',...o.shading==='standard'?{normals:'smooth' as const}:{},side:'double',maxBytes:o.maxBytes,maxRayTests:o.maxRayTests}),r=>r.dispose());
  const stage=creationStage(init,o,async c=>draw.render({context:c,camera:o.camera??strokeCamera(init),objects:sample(c).map(d=>({...d,appearance:strokeAppearance(o,c)})),format:o.format??'rgba32float',signal:o.signal}),async()=>{try{await draw.dispose();}finally{for(const g of geometries)g.dispose();}},()=>({kind,geometry:geometries.map(g=>g.describe()),renderer:draw.stats(),time:'absolute existing FrameContext; no history or frame advance'}));a.keep(meshOwner);a.keep(draw);return stage;
 });
}
export function aggregateGeometry(init:CreationInit,o:StrokeAppearance,count:number,d:{plannedBytes:number;plannedWork?:number},work=0){
 const bytes=d.plannedBytes*count+init.width*init.height*16,totalWork=(d.plannedWork??work)*count;if(!Number.isSafeInteger(count)||count<1||!Number.isSafeInteger(bytes)||!Number.isSafeInteger(totalWork)||bytes>(o.maxBytes??512*1024**2)||totalWork>(o.maxWork??100000000))fail('Complete geometry/value plan exceeds explicit maxBytes/maxWork','E_CREATION_BUDGET');
}
export async function stroke3D(init:CreationInit,options:Stroke3DOptions){
 validateCreation(init,options,[...strokeAppearanceKeys,...geometryKeys,'points','thickness','twist']);checkStrokeAppearance(options);const o=strokeSnapshot(options);if(!Array.isArray(o.points)||o.points.some(p=>!Array.isArray(p)||p.length!==3))fail('points need an authored list of three scalar Signals per station');
 const geometry=createTrailGeometry({id:'creation.stroke',pointCount:o.points.length,kind:o.kind,radialSegments:o.radialSegments,closed:o.closed,caps:o.caps,maxVerticesPerMesh:o.maxVerticesPerMesh,maxBytes:o.maxBytes,maxWork:o.maxWork});try{const d=geometry.describe();aggregateGeometry(init,o,1,d,d.vertices*64+d.pointCount*256);}catch(e){geometry.dispose();throw e;}
 return geometryCreator(init,o,[geometry],c=>geometry.sample({points:o.points.map((p,i)=>vector(p,c,'point '+i)),radius:(Array.isArray(o.thickness)?[...o.thickness]:o.thickness??.025) as Signal<number>|Signal<number>[],twist:o.twist,firstNormal:o.firstNormal,context:c}).draws,'stroke-3d');
}
export function neonStroke(init:CreationInit,o:Stroke3DOptions){return stroke3D(init,{...o,finish:o.finish??neonFinish});}
async function shape(init:CreationInit,options:NeonShapeOptions,kind:StrokeShape){
 validateCreation(init,options,[...strokeAppearanceKeys,...geometryKeys.filter(k=>!['closed','caps'].includes(k)),...shapeKeys]);checkStrokeAppearance(options);const o=strokeSnapshot({...options,finish:options.finish??neonFinish}),closed=kind!=='spiral',pointCount=shapeCount(o,closed),count=o.count??(kind==='orbits'?3:1);
 if(!Number.isSafeInteger(count)||count<1||kind!=='orbits'&&count!==1)fail('count is a positive integer; multiple loops use orbitRibbons');
 const geometries:TrailGeometry[]=[];try{
  const make=(i:number)=>createTrailGeometry({id:'creation.'+kind+'.'+i,pointCount,kind:o.kind??(kind==='orbits'?'ribbon':'tube'),radialSegments:o.radialSegments,closed,maxVerticesPerMesh:o.maxVerticesPerMesh,maxBytes:o.maxBytes,maxWork:o.maxWork});geometries.push(make(0));const d=geometries[0].describe();aggregateGeometry(init,o,count,d,d.vertices*64+d.pointCount*256);for(let i=1;i<count;i++)geometries.push(make(i));
 }catch(e){for(const g of geometries)g.dispose();throw e;}
 return geometryCreator(init,o,geometries,c=>geometries.flatMap((g,i)=>{const points=shapePoints(kind,o,c,i,count),center=vector(o.center??[0,0,0],c,'center'),firstNormal=o.firstNormal??(closed?points[0].map((v,k)=>v-center[k]) as Vec3:undefined);return g.sample({points,radius:o.thickness??(kind==='orbits'?.035:.018),twist:o.twist,firstNormal,context:c}).draws;}),'neon-'+kind);
}
export function neonRing(init:CreationInit,o:NeonShapeOptions={}){return shape(init,o,'ring');}
export function neonSpiral(init:CreationInit,o:NeonShapeOptions={}){return shape(init,o,'spiral');}
export function orbitRibbons(init:CreationInit,o:NeonShapeOptions={}){return shape(init,o,'orbits');}
