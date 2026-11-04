import {PlaneGeometry} from 'three';
import {geometryData} from './geometry.ts';
import {validateMeshData} from '../graphics-contracts/validate.ts';import {LIMITS} from '../graphics-contracts/check.ts';
import type {MeshData,Vec3} from '../graphics-contracts/types.ts';
import type {RigidBody,RigidCollider,RigidJoint} from '../rigid-body-effects/native.ts';
import {EngineError} from '../../src/core/errors.ts';
export function assetError(message:string):never{throw new EngineError('E_CREATION_ASSET',message);}
export function assetOptions(value:unknown,keys:readonly string[],name:string):void{if(!value||typeof value!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(value)))assetError(name+' must be plain options');for(const key of Reflect.ownKeys(value)){const d=Object.getOwnPropertyDescriptor(value,key)!;if(typeof key!=='string'||!keys.includes(key)||!d.enumerable||!('value'in d))assetError(name+' has an unknown/accessor field: '+String(key));}}
export function assetNumber(value:number,name:string,min=-Infinity,max=Infinity){if(!Number.isFinite(value)||value<min||value>max)assetError(name+' must be finite in ['+min+', '+max+']');return value;}
export function assetVector(value:readonly number[],name:string,min=-Infinity):Vec3{if(!Array.isArray(value)||value.length!==3)assetError(name+' requires three components');return value.map(v=>assetNumber(v,name,min)) as Vec3;}
function id(value:string){if(typeof value!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(value))assetError('An existing Rigid stable ID is required');return value;}
export interface ClothSheetOptions {id?:string;size?:readonly [number,number];segments?:readonly [number,number];plane?:'xy'|'xz';center?:Vec3;maxValueBytes?:number}
/** Plain Graphics MeshData, shared vertices and top-left UV. Sizes are meters;
 * row0 is the top UV edge. Existing Graphics-v1 limits still apply. */
export function clothSheet(o:ClothSheetOptions={}):MeshData{
 assetOptions(o,['id','size','segments','plane','center','maxValueBytes'],'cloth sheet');const size=o.size??[2.4,1.6],segments=o.segments??[12,8];if(!Array.isArray(size)||size.length!==2||!Array.isArray(segments)||segments.length!==2)assetError('Sheet size and segments require two components');size.forEach(v=>assetNumber(v,'sheet size',Number.MIN_VALUE));segments.forEach(v=>{if(!Number.isSafeInteger(v)||v<1)assetError('Sheet segments must be positive integers');});const vertices=(segments[0]+1)*(segments[1]+1),indexCount=segments[0]*segments[1]*6,budget=assetNumber(o.maxValueBytes??64*1024**2,'maxValueBytes',1),planned=vertices*64+indexCount*8;
 if(!Number.isSafeInteger(planned)||planned>budget||vertices>LIMITS.vertices||indexCount>LIMITS.array)assetError('Sheet plan exceeds explicit value budget or existing Graphics-v1 MeshData limits');const plane=o.plane??'xy';if(!['xy','xz'].includes(plane))assetError('Sheet plane must be xy or xz');const center=assetVector(o.center??[0,0,0],'sheet center'),mesh=geometryData(o.id??'creation.cloth',new PlaneGeometry(size[0],size[1],segments[0],segments[1]),true);
 mesh.restPositions=mesh.restPositions.map(([x,y,z])=>(plane==='xy'?[x+center[0],y+center[1],z+center[2]]:[x+center[0],z+center[1],-y+center[2]]) as Vec3);mesh.vertexIds=mesh.vertexIds.map((_,i)=>'r'+Math.floor(i/(segments[0]+1))+'c'+i%(segments[0]+1));return validateMeshData(mesh);
}
export interface BodyControls {id:string;position?:Vec3;velocity?:Vec3;bounce?:number;friction?:number;density?:number;body?:Partial<Omit<RigidBody,'id'|'colliders'>>;collider?:Omit<RigidCollider,'id'|'shape'|'density'|'friction'|'restitution'>}
function body(o:BodyControls,shape:RigidCollider['shape'],kind:RigidBody['kind']='dynamic'):RigidBody{
 const collider={...o.collider,id:id(o.id),shape,density:assetNumber(o.density??1,'density',Number.MIN_VALUE),restitution:assetNumber(o.bounce??.65,'bounce',0,1),friction:assetNumber(o.friction??.35,'friction',0)};
 return structuredClone(Object.fromEntries(Object.entries({kind,...o.body,id:id(o.id),position:assetVector(o.position??o.body?.position??[0,0,0],'position'),linearVelocity:o.velocity?assetVector(o.velocity,'velocity'):o.body?.linearVelocity,colliders:[collider]}).filter(([,v])=>v!==undefined))) as unknown as RigidBody;
}
export interface BallBodyOptions extends BodyControls {radius?:number}
export function ballBody(o:BallBodyOptions):RigidBody{assetOptions(o,['id','position','velocity','bounce','friction','density','body','collider','radius'],'ball body');return body(o,{kind:'ball',radius:assetNumber(o.radius??.22,'radius',Number.MIN_VALUE)});}
export interface BoxBodyOptions extends BodyControls {size?:Vec3}
export function boxBody(o:BoxBodyOptions):RigidBody{assetOptions(o,['id','position','velocity','bounce','friction','density','body','collider','size'],'box body');const size=assetVector(o.size??[.4,.4,.4],'box size',Number.MIN_VALUE);return body(o,{kind:'cuboid',halfExtents:size.map(v=>v/2) as Vec3});}
export interface GroundBodyOptions {id?:string;size?:Vec3;height?:number;friction?:number;bounce?:number}
/** Height is the TOP surface, not the cuboid centre. */
export function groundBody(o:GroundBodyOptions={}):RigidBody{assetOptions(o,['id','size','height','friction','bounce'],'ground');const size=assetVector(o.size??[5,.12,2],'ground size',Number.MIN_VALUE),height=assetNumber(o.height??-1.1,'ground height');return body({id:o.id??'floor',position:[0,height-size[1]/2,0],friction:o.friction??.5,bounce:o.bounce??.1},{kind:'cuboid',halfExtents:size.map(v=>v/2) as Vec3},'fixed');}
export interface SpringJointOptions {id:string;between:readonly [string,string];length?:number;stiffness?:number;damping?:number;anchorA?:Vec3;anchorB?:Vec3;contacts?:boolean}
export function springJoint(o:SpringJointOptions):RigidJoint{assetOptions(o,['id','between','length','stiffness','damping','anchorA','anchorB','contacts'],'spring joint');if(!Array.isArray(o.between)||o.between.length!==2||o.between[0]===o.between[1])assetError('Spring needs two distinct body IDs');if(o.contacts!==undefined&&typeof o.contacts!=='boolean')assetError('contacts must be boolean');return {id:id(o.id),kind:'spring',bodyA:id(o.between[0]),bodyB:id(o.between[1]),restLength:assetNumber(o.length??1,'spring length',0),stiffness:assetNumber(o.stiffness??25,'stiffness',Number.MIN_VALUE),damping:assetNumber(o.damping??1,'damping',0),anchorA:assetVector(o.anchorA??[0,0,0],'anchorA'),anchorB:assetVector(o.anchorB??[0,0,0],'anchorB'),contacts:o.contacts??false};}
