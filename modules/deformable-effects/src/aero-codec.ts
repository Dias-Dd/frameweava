import {deformableError} from './codec.ts';
import type {Vec3} from './types.ts';
export const forceCapacity=(n:number)=>80+n*24;
export function aerodynamicConfiguration(faces:[number,number,number][]){
 const bytes=new Uint8Array(8+faces.length*12),v=new DataView(bytes.buffer);v.setUint32(0,0x31434641,true);v.setUint32(4,faces.length,true);let at=8;for(const f of faces)for(const i of f){v.setUint32(at,i,true);at+=4;}return bytes;
}
export function aerodynamicPacket(positions:Float64Array,velocities:Float64Array,values:{density:number;normalDrag:number;tangentialDrag:number;pressure:number;wind:Vec3}){
 const n=positions.length/3,bytes=new Uint8Array(64+n*48),v=new DataView(bytes.buffer);v.setUint32(0,0x31534641,true);v.setUint32(4,n,true);let at=8;for(const x of [values.density,values.normalDrag,values.tangentialDrag,values.pressure,...values.wind,...positions,...velocities]){v.setFloat64(at,x,true);at+=8;}return bytes;
}
export function readAerodynamicSample(bytes:Uint8Array,n:number,faces:number){
 if(bytes.length!==forceCapacity(n))deformableError('E_DEFORM_BYTES','Malformed aerodynamic output length');const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(v.getUint32(0,true)!==0x31524641||v.getUint32(4,true)!==n)deformableError('E_DEFORM_BYTES','Malformed aerodynamic output header');
 const activeFaces=v.getUint32(8,true),degenerateFaces=v.getUint32(12,true);if(activeFaces+degenerateFaces>faces)deformableError('E_DEFORM_BYTES','Malformed face diagnostics');
 const read=(at:number)=>{const x=v.getFloat64(at,true);if(!Number.isFinite(x))deformableError('E_DEFORM_NUMERIC','Nonfinite aerodynamic result');return x;},vec=(at:number)=>[read(at),read(at+8),read(at+16)] as Vec3;
 const forces=Float64Array.from({length:n*3},(_,i)=>read(80+i*8));return {forces,totalForce:vec(16),dynamicForce:vec(40),maxAcceleration:read(64),dissipatedPower:read(72),activeFaces,degenerateFaces};
}
