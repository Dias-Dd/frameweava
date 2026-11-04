import {BoxGeometry,SphereGeometry,CapsuleGeometry,Matrix4,Quaternion,Vector3} from 'three';
import {geometryData as geometry} from './geometry.ts';
import {createNativeRigidBodyTools} from '../rigid-body-effects/native.ts';
import type {RigidWorldOptions,RigidSimulation,RigidShape} from '../rigid-body-effects/native.ts';
import {createNativeDeformableTools,ropeOptions,clothOptions} from '../deformable-effects/native.ts';
import type {DeformableSimulation} from '../deformable-effects/native.ts';
import type {RopeOptions,ClothOptions} from '../deformable-effects/src/factories.ts';
import {createNativeMeshRenderer,createTrailGeometry} from '../skeletal-effects/native.ts';
import type {MeshData,Vec3,Matrix4 as Matrix} from '../skeletal-effects/native.ts';
import type {ModuleLoader} from '../../src/plugins/sdk.ts';
import type {FrameContext} from '../../src/core/types.ts';
import type {CreationInit,CreationOptions,CameraOptions,MaterialOptions} from './types.ts';
import {creationStage,defaultCamera,material,scalar,fail,validateCreation,materialKeys} from './lifecycle.ts';

const lights={ambient:[.15,.18,.24] as Vec3,directional:[{direction:[-1,1,2] as Vec3,color:[1,.8,.65] as Vec3,intensity:2.7},{direction:[1,1,-1] as Vec3,color:[.25,.6,1] as Vec3,intensity:2}]};
export function colliderMesh(id:string,shape:RigidShape):MeshData{
 if(shape.kind==='convexHull'||shape.kind==='trimesh'){if(shape.kind==='convexHull')fail('Convex hull display requires an explicitly authored hull mesh; use the low-level renderer','E_CREATION_GEOMETRY');return {...structuredClone(shape.mesh),id};}
 return geometry(id,shape.kind==='ball'?new SphereGeometry(shape.radius,12,8):shape.kind==='cuboid'?new BoxGeometry(...shape.halfExtents.map(v=>v*2) as [number,number,number]):new CapsuleGeometry(shape.radius,shape.halfHeight*2,4,12));
}
export interface PhysicsAppearance extends CreationOptions,CameraOptions,MaterialOptions {maxRayTests?:number;maxBytes?:number}
export interface RigidSceneOptions extends PhysicsAppearance {world?:Omit<RigidWorldOptions,'fps'>}
const defaultWorld:Omit<RigidWorldOptions,'fps'>={gravity:[0,-4,0],substeps:4,bodies:[{id:'floor',kind:'fixed',position:[0,-1.15,0],colliders:[{id:'floor.collider',shape:{kind:'cuboid',halfExtents:[2.5,.08,1]}}]},{id:'ball',kind:'dynamic',position:[-.45,.8,0],linearVelocity:[.6,0,0],colliders:[{id:'ball.collider',shape:{kind:'ball',radius:.26},restitution:.7}]},{id:'box',kind:'dynamic',position:[.6,1.4,0],angularVelocity:[0,0,.5],colliders:[{id:'box.collider',shape:{kind:'cuboid',halfExtents:[.25,.25,.25]},restitution:.25}]}]};
/** Existing Rapier solver, owned reset/checkpoints, exact primitive collider
 * display. No collision-world object crosses a Stage or enters the port ABI. */
export async function rigidScene(init:CreationInit,options:RigidSceneOptions={},load?:ModuleLoader){
 if(!load)fail('Rigid scene requires a verified Rapier byte loader and explicit WASM authorization','E_CREATION_SERVICE');validateCreation(init,options,[...materialKeys,'camera','maxRayTests','maxBytes','world']);const {post,signal,...raw}=options,o=structuredClone(raw),world=o.world??structuredClone(defaultWorld);
 const records=world.bodies.flatMap((body,bi)=>body.colliders.map((collider,ci)=>{const mesh=colliderMesh('creation.rigid.'+bi+'.'+ci,collider.shape),m=new Matrix4().compose(new Vector3(...collider.position??[0,0,0]),new Quaternion(...collider.rotation??[0,0,0,1]),new Vector3(1,1,1));mesh.restPositions=mesh.restPositions.map(p=>new Vector3(...p).applyMatrix4(m).toArray() as Vec3);return {body:body.id,mesh};}));
 const image=await createNativeMeshRenderer(init.gpu,records.map(r=>r.mesh),{width:init.width,height:init.height,shading:'standard',maxBytes:o.maxBytes,maxRayTests:o.maxRayTests});let simulation:RigidSimulation|undefined,fps:string|undefined;
 return creationStage(init,{...o,post,signal},async c=>{const key=JSON.stringify(c.fps);if(fps!==undefined&&key!==fps)fail('Simulation FPS changed; reopen Stage','E_CREATION_TIME');simulation??=await createNativeRigidBodyTools(load).createRigidBodies({...world,fps:c.fps,seed:world.seed??init.seed},{signal});fps=key;const state=await simulation.sample(c),byId=new Map(state.bodies.map(b=>[b.id,b]));return image.render({context:c,camera:o.camera??{...defaultCamera,position:[2,1.3,6]},objects:records.map(({body,mesh},i)=>{const b=byId.get(body)!;return {id:mesh.id,model:new Matrix4().compose(new Vector3(...b.position),new Quaternion(...b.rotation),new Vector3(1,1,1)).toArray() as Matrix,appearance:material({...o,ink:o.ink??(i===0?[.035,.05,.08]:i%2?[.8,.22,.06]:[.03,.6,.9])},c)};}),lighting:lights,format:o.format??'rgba32float',signal});},async()=>{try{await simulation?.dispose();}finally{await image.dispose();}},()=>({kind:'rigid-scene',solver:'Rapier3D-f64 0.36.1; Core fixed step/checkpoints',renderer:image.stats()}));
}
export interface RopeSceneOptions extends PhysicsAppearance {points?:Vec3[];simulation?:Omit<RopeOptions,'fps'>;radius?:import('../../src/core/types.ts').Signal<number>;radialSegments?:number}
export async function ropeScene(init:CreationInit,options:RopeSceneOptions={},load?:ModuleLoader){
 if(!load)fail('Rope requires a verified XPBD byte loader and explicit WASM authorization','E_CREATION_SERVICE');validateCreation(init,options,[...materialKeys,'camera','maxRayTests','maxBytes','points','simulation','radius','radialSegments']);const {post,signal,...raw}=options,o=structuredClone(raw),points=o.points??Array.from({length:25},(_,i)=>[-1.8+i*.15,.65-Math.sin(i/24*Math.PI)*.4,0] as Vec3),trail=createTrailGeometry({id:'creation.rope',pointCount:points.length,radialSegments:o.radialSegments??6,maxBytes:o.maxBytes});let image:Awaited<ReturnType<typeof createNativeMeshRenderer>>;
 try{image=await createNativeMeshRenderer(init.gpu,trail.meshes,{width:init.width,height:init.height,shading:'standard',normals:'smooth',maxBytes:o.maxBytes,maxRayTests:o.maxRayTests});}catch(e){trail.dispose();throw e;}
 let simulation:DeformableSimulation|undefined,fps:string|undefined;
 return creationStage(init,{...o,post,signal},async c=>{const key=JSON.stringify(c.fps);if(fps!==undefined&&key!==fps)fail('Simulation FPS changed; reopen Stage','E_CREATION_TIME');simulation??=await createNativeDeformableTools(load).createDeformables(ropeOptions(points,{substeps:4,iterations:12,fixedParticles:[0,points.length-1],gravity:[0,-2,0],...o.simulation,fps:c.fps,seed:o.simulation?.seed??init.seed}),{signal});fps=key;const state=await simulation.sample(c),shape=trail.sample({points:state.positions,radius:scalar(o.radius??.045,c,'rope radius',0),context:c});return image.render({context:c,camera:o.camera??defaultCamera,objects:shape.draws.map(d=>({...d,appearance:material(o,c)})),lighting:lights,format:o.format??'rgba32float',signal});},async()=>{try{await simulation?.dispose();}finally{await image.dispose();trail.dispose();}},()=>({kind:'rope-scene',solver:'existing XPBD distance network; no twist/self collision',renderer:image.stats()}));
}
export interface ClothDecoration {mesh:MeshData;material?:MaterialOptions}
export interface ClothSceneOptions extends PhysicsAppearance {mesh:MeshData;simulation?:Omit<ClothOptions,'fps'>;/** Display positions only; solver/checkpoints keep double precision. Default strict. */renderPrecision?:'strict'|'float32';/** Visuals only; collisions remain explicitly in simulation.collision. */decorations?:readonly ClothDecoration[]}
/** Explicit display conversion for presets: round GPU-bound positions, never
 * mutate solver state. Tiny solver roundoff can underflow to exact zero. */
export function clothDisplayPositions(positions:readonly Vec3[],precision:ClothSceneOptions['renderPrecision']='strict'):Vec3[]{
 if(precision!=='strict'&&precision!=='float32')fail('Cloth renderPrecision must be strict or float32','E_CREATION_GEOMETRY');
 return positions.map(p=>p.map(v=>{const n=precision==='float32'?Math.fround(v):v;if(!Number.isFinite(n))fail('Cloth display position exceeds finite GPU range','E_CREATION_GEOMETRY');return n;}) as Vec3);
}
export async function clothScene(init:CreationInit,options:ClothSceneOptions,load?:ModuleLoader){
 if(!load)fail('Cloth requires a verified XPBD byte loader and explicit WASM authorization','E_CREATION_SERVICE');validateCreation(init,options,[...materialKeys,'camera','maxRayTests','maxBytes','mesh','simulation','decorations','renderPrecision']);const {post,signal,...raw}=options,o=structuredClone(raw),image=await createNativeMeshRenderer(init.gpu,[o.mesh,...o.decorations?.map(d=>d.mesh)??[]],{width:init.width,height:init.height,shading:'standard',normals:'smooth',side:'double',maxBytes:o.maxBytes,maxRayTests:o.maxRayTests});let simulation:DeformableSimulation|undefined,fps:string|undefined;
 return creationStage(init,{...o,post,signal},async(c:FrameContext)=>{const key=JSON.stringify(c.fps);if(fps!==undefined&&key!==fps)fail('Simulation FPS changed; reopen Stage','E_CREATION_TIME');simulation??=await createNativeDeformableTools(load).createDeformables(clothOptions(o.mesh,{substeps:4,iterations:12,gravity:[0,-2,0],fixedVertices:[o.mesh.vertexIds[0]],...o.simulation,fps:c.fps,seed:o.simulation?.seed??init.seed}),{signal});fps=key;const state=await simulation.sample(c);return image.render({context:c,camera:o.camera??defaultCamera,objects:[{id:o.mesh.id,positions:clothDisplayPositions(state.positions,o.renderPrecision),appearance:material(o,c)},...o.decorations?.map(d=>({id:d.mesh.id,appearance:material(d.material??{},c)}))??[]],lighting:lights,format:o.format??'rgba32float',signal});},async()=>{try{await simulation?.dispose();}finally{await image.dispose();}},()=>({kind:'cloth-scene',solver:'existing XPBD distance/isometric bending; no new simulation runner',renderer:image.stats()}));
}
