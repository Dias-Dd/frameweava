// SPDX-License-Identifier: Apache-2.0
import type {Signal} from '../../src/core/types.ts';
import type {MeshData,Vec3} from '../graphics-contracts/types.ts';
import {validateMeshData} from '../graphics-contracts/validate.ts';
import {ropeOptions,clothOptions,type RopeOptions,type ClothOptions} from '../deformable-effects/src/factories.ts';
import type {DeformableOptions} from '../deformable-effects/src/types.ts';
import {assetOptions,assetNumber,assetVector} from './physics-assets.ts';
import type {AnimatedVec3} from './types.ts';
import {fail} from './lifecycle.ts';
const invalid=(message:string):never=>fail(message,'E_CONTACT_PARAMETER');
export interface PhysicsParticle {position:Vec3;velocity?:Vec3;mass?:number;radius?:number;fixed?:boolean}
export interface ContactModel {
 kind:'particles'|'rope'|'cloth';physics:Omit<DeformableOptions,'fps'|'collision'|'rod'|'aerodynamics'>;
 edges:readonly (readonly [number,number])[];faces:readonly (readonly [number,number,number])[];radii:readonly number[];mesh?:MeshData;
}
export interface ColliderMaterial {id?:string;friction?:number;restitution?:number}
export type ContactCollider=ColliderMaterial&(
 | {kind:'sphere';center?:AnimatedVec3;radius:number}
 | {kind:'plane';normal:Vec3;offset?:Signal<number>}
 | {kind:'mesh';mesh:MeshData;position?:AnimatedVec3;rotation?:AnimatedVec3;scale?:Vec3;thickness?:number}
);
export interface SelfCollisionSettings {particles?:boolean;vertices?:boolean;edges?:boolean;ccd?:boolean;strict?:boolean;radius?:number;tolerance?:number;compliance?:number;friction?:number;restitution?:number;ccdIterations?:number;maxContacts?:number;maxWork?:number}
function material(o:ColliderMaterial){if(o.id!==undefined&&(typeof o.id!=='string'||!o.id))invalid('Collider id must not be empty');assetNumber(o.friction??.3,'friction',0);assetNumber(o.restitution??0,'restitution',0,1);}
export function physicsParticle(o:PhysicsParticle):PhysicsParticle{assetOptions(o,['position','velocity','mass','radius','fixed'],'physics particle');assetVector(o.position,'particle position');if(o.velocity)assetVector(o.velocity,'particle velocity');assetNumber(o.mass??1,'mass',Number.MIN_VALUE);assetNumber(o.radius??.05,'radius',0);if(o.fixed!==undefined&&typeof o.fixed!=='boolean')invalid('fixed must be boolean');return structuredClone(o);}
export function collisionSphere(o:Omit<Extract<ContactCollider,{kind:'sphere'}>,'kind'>):ContactCollider{assetOptions(o,['id','friction','restitution','center','radius'],'moving sphere');material(o);assetNumber(o.radius,'sphere radius',Number.MIN_VALUE);return structuredClone({kind:'sphere',...o});}
export function collisionPlane(o:Omit<Extract<ContactCollider,{kind:'plane'}>,'kind'>):ContactCollider{assetOptions(o,['id','friction','restitution','normal','offset'],'moving plane');material(o);const normal=assetVector(o.normal,'plane normal');if(Math.abs(Math.hypot(...normal)-1)>1e-10)invalid('Plane normal must already be unit length');return structuredClone({kind:'plane',...o});}
/** Explicit Graphics mesh data, not a runtime file/URL import or live engine object. */
export function collisionMesh(mesh:MeshData,o:Omit<Extract<ContactCollider,{kind:'mesh'}>,'kind'|'mesh'>={}):ContactCollider{assetOptions(o,['id','friction','restitution','position','rotation','scale','thickness'],'moving mesh');material(o);if(o.scale)assetVector(o.scale,'mesh scale',Number.MIN_VALUE);assetNumber(o.thickness??0,'mesh thickness',0);return {kind:'mesh',mesh:validateMeshData(structuredClone(mesh)),...structuredClone(o)};}
export function selfCollision(o:SelfCollisionSettings={}):SelfCollisionSettings{
 assetOptions(o,['particles','vertices','edges','ccd','strict','radius','tolerance','compliance','friction','restitution','ccdIterations','maxContacts','maxWork'],'self collision');for(const key of ['particles','vertices','edges','ccd','strict'] as const)if(o[key]!==undefined&&typeof o[key]!=='boolean')invalid(key+' must be boolean');
 if(o.radius!==undefined)assetNumber(o.radius,'collision radius',0);assetNumber(o.tolerance??1e-7,'tolerance',Number.MIN_VALUE);assetNumber(o.compliance??0,'contact compliance',0);assetNumber(o.friction??.3,'friction',0);assetNumber(o.restitution??0,'restitution',0,1);for(const [key,value]of [['ccdIterations',o.ccdIterations??512],['maxContacts',o.maxContacts??4096],['maxWork',o.maxWork??1e8]] as const)if(!Number.isSafeInteger(value)||value<1)invalid(key+' must be a positive safe integer');return structuredClone(o);
}
export function contactParticles(values:readonly PhysicsParticle[]):ContactModel{if(!Array.isArray(values))invalid('Explicit particle array required');const p=values.map(physicsParticle);return {kind:'particles',physics:{restPositions:p.map(p=>[...p.position]),velocities:p.map(p=>p.velocity??[0,0,0]),inverseMasses:p.map(p=>p.fixed?0:1/(p.mass??1)),constraints:[]},edges:[],faces:[],radii:p.map(p=>p.radius??.05)};}
export type ContactRopeOptions=Omit<RopeOptions,'fps'|'collision'> & {radius?:number};
export function contactRope(points:Vec3[],options:ContactRopeOptions={}):ContactModel{const {radius=.025,...raw}=options;assetNumber(radius,'rope contact radius',0);const {fps:_fps,collision:_collision,rod:_rod,aerodynamics:_aero,...physics}=ropeOptions(points,{...raw,fps:24});return {kind:'rope',physics,edges:points.slice(1).map((_,i)=>[i,i+1]),faces:[],radii:points.map(()=>radius)};}
export type ContactClothOptions=Omit<ClothOptions,'fps'|'collision'|'aerodynamics'> & {radius?:number};
export function contactCloth(input:MeshData,options:ContactClothOptions={}):ContactModel{const {radius=.01,...raw}=options;assetNumber(radius,'cloth contact radius',0);const mesh=validateMeshData(structuredClone(input)),{fps:_fps,collision:_collision,rod:_rod,aerodynamics:_aero,...physics}=clothOptions(mesh,{...raw,fps:24}),faces=Array.from({length:mesh.indices.length/3},(_,i)=>mesh.indices.slice(i*3,i*3+3) as [number,number,number]),edges=new Map<string,[number,number]>();for(const f of faces)for(let k=0;k<3;k++){const a=Math.min(f[k],f[(k+1)%3]),b=Math.max(f[k],f[(k+1)%3]);edges.set(a+':'+b,[a,b]);}return {kind:'cloth',physics,mesh,edges:[...edges.values()],faces,radii:mesh.restPositions.map(()=>radius)};}
