import {deformableError,type Vec3} from './codec.ts';import {MAX_BYTES} from '../runtime/session.mjs';
interface Material {id:string;friction?:number;restitution?:number}
export type DeformableCollider=Material&({kind:'plane';normal:Vec3;offset:number}|{kind:'sphere';center:Vec3;radius:number});
export interface DeformableCollision {colliders:DeformableCollider[];radii?:number|number[];tolerance?:number}
export interface DeformableContact {particle:number;colliderId:string;normal:Vec3;point:Vec3;sweepFraction:number;normalImpulse:number;tangentImpulse:Vec3;penetration:number;active:boolean}
export type PreparedCollider=DeformableCollider&{friction:number;restitution:number};
export interface PreparedCollision {colliders:PreparedCollider[];radii:number[];tolerance:number;maxContacts:number}
export type ContactRecord=Omit<DeformableContact,'colliderId'>&{collider:number};
const HEADER=56,STRIDE=112;
function finite(v:number){if(!Number.isFinite(v))deformableError('E_DEFORM_PROTOCOL','Nonfinite contact binary data');return v;}
function bytes(length:number){if(!Number.isSafeInteger(length)||length<0||length>MAX_BYTES)deformableError('E_DEFORM_BYTES','Contact packet exceeds existing bytes-v1 limit');return new Uint8Array(length);}
export function contactCapacity(n:number,m:number,contacts:number){return HEADER+48*n+8*m+STRIDE*contacts;}
export function contactConfiguration(c:PreparedCollision){const b=bytes(24+c.radii.length*8+c.colliders.length*52),v=new DataView(b.buffer);v.setUint32(0,0x31434644,true);v.setUint32(4,c.radii.length,true);v.setUint32(8,c.colliders.length,true);v.setUint32(12,c.maxContacts,true);v.setFloat64(16,c.tolerance,true);let at=24;for(const radius of c.radii){v.setFloat64(at,radius,true);at+=8;}for(const collider of c.colliders){v.setUint32(at,collider.kind==='plane'?0:1,true);at+=4;for(const x of collider.kind==='plane'?[...collider.normal,collider.offset]:[...collider.center,collider.radius]){v.setFloat64(at,finite(x),true);at+=8;}v.setFloat64(at,collider.friction,true);at+=8;v.setFloat64(at,collider.restitution,true);at+=8;}return b;}
export function contactProjection(positions:ArrayLike<number>,previous:ArrayLike<number>,incoming:ArrayLike<number>,iterations:number,dt:number){if(positions.length%3||positions.length!==previous.length||positions.length!==incoming.length||!Number.isInteger(iterations)||iterations<0||iterations>0xffffffff||!Number.isFinite(dt)||dt<=0)deformableError('E_DEFORM_PARAMETER','Matching contact XYZ arrays and fixed timestep required');const b=bytes(16+positions.length*24),v=new DataView(b.buffer);v.setUint32(0,0x31435044,true);v.setUint32(4,iterations,true);v.setFloat64(8,dt,true);let at=16;for(const values of [positions,previous,incoming])for(let i=0;i<values.length;i++){v.setFloat64(at,finite(values[i]),true);at+=8;}return b;}
export function readContactProjection(b:Uint8Array,n:number,m:number,colliders:number,maxContacts:number){
  if(b.length<HEADER)deformableError('E_DEFORM_PROTOCOL','Short contact reply');const v=new DataView(b.buffer,b.byteOffset,b.byteLength),count=v.getUint32(48,true);if(v.getUint32(0,true)!==0x31435244||v.getUint32(4,true)!==n||v.getUint32(8,true)!==m||v.getUint32(52,true)!==0||count>maxContacts||b.length!==contactCapacity(n,m,count))deformableError('E_DEFORM_PROTOCOL','Contact reply identity/size mismatch');
  let at=HEADER;function floats(length:number){const values=new Float64Array(length);for(let i=0;i<length;i++){values[i]=finite(v.getFloat64(at,true));at+=8;}return values;}
  const positions=floats(3*n),velocities=floats(3*n),multipliers=floats(m),contacts:ContactRecord[]=[];
  contacts.push(...readContactRecords(v,at,count,n,colliders));
  const maxPenetration=finite(v.getFloat64(32,true)),maxNormalVelocityResidual=finite(v.getFloat64(40,true));if(maxPenetration<0||maxNormalVelocityResidual<0)deformableError('E_DEFORM_PROTOCOL','Negative contact residual');return {positions,velocities,multipliers,contacts,maxPenetration,maxNormalVelocityResidual,maxDistanceResidual:finite(v.getFloat64(16,true)),maxBendResidual:finite(v.getFloat64(24,true)),iterations:v.getUint32(12,true)};
}

export function readContactRecords(v:DataView,at:number,count:number,n:number,colliders:number):ContactRecord[]{
  function vector(offset:number):Vec3{return [finite(v.getFloat64(offset,true)),finite(v.getFloat64(offset+8,true)),finite(v.getFloat64(offset+16,true))];}
  const contacts:ContactRecord[]=[];const keys=new Set<string>();for(let j=0;j<count;j++){const particle=v.getUint32(at,true),collider=v.getUint32(at+4,true),normal=vector(at+8),point=vector(at+32),sweepFraction=finite(v.getFloat64(at+56,true)),normalImpulse=finite(v.getFloat64(at+64,true)),tangentImpulse=vector(at+72),penetration=finite(v.getFloat64(at+96,true)),active=v.getUint32(at+104,true),key=particle+':'+collider;if(particle>=n||collider>=colliders||keys.has(key)||sweepFraction<0||sweepFraction>1||normalImpulse<0||penetration<0||Math.abs(Math.hypot(...normal)-1)>1e-9||active>1||v.getUint32(at+108,true)!==0)deformableError('E_DEFORM_PROTOCOL','Invalid contact record');keys.add(key);contacts.push({particle,collider,normal,point,sweepFraction,normalImpulse,tangentImpulse,penetration,active:active===1});at+=STRIDE;}
  return contacts;
}
