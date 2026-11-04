import {BoxGeometry,SphereGeometry,TorusGeometry,CylinderGeometry,ConeGeometry,CapsuleGeometry,TorusKnotGeometry,IcosahedronGeometry} from 'three';
import {LIMITS} from '../graphics-contracts/check.ts';
import {geometryData} from './geometry.ts';
import {assetOptions,assetNumber,assetVector} from './physics-assets.ts';
import {fail} from './lifecycle.ts';

export type PrimitiveKind='box'|'sphere'|'torus'|'cylinder'|'cone'|'capsule'|'knot'|'icosahedron';
export interface PrimitiveGeometry {
 /** Immutable setup. Dimensions in meters. detail scales tessellation, never quality automatically. */
 size?:readonly [number,number,number];radius?:number;height?:number;tube?:number;detail?:number;
}
export type PrimitiveGeometryKeys={box:'size';sphere:'radius'|'detail';torus:'radius'|'tube'|'detail';cylinder:'radius'|'height'|'detail';cone:'radius'|'height'|'detail';capsule:'radius'|'height'|'detail';knot:'radius'|'tube'|'detail';icosahedron:'radius'|'detail'};
export type ShapeGeometry<K extends PrimitiveKind>=Pick<PrimitiveGeometry,PrimitiveGeometryKeys[K]>;
export const primitiveKinds:PrimitiveKind[]=['box','sphere','torus','cylinder','cone','capsule','knot','icosahedron'];
const allowed:Record<PrimitiveKind,string[]>={box:['size'],sphere:['radius','detail'],torus:['radius','tube','detail'],cylinder:['radius','height','detail'],cone:['radius','height','detail'],capsule:['radius','height','detail'],knot:['radius','tube','detail'],icosahedron:['radius','detail']};
export const primitiveGeometryKeys=['size','radius','height','tube','detail'];
/** Preflight conservative Three allocation/value plan BEFORE constructing geometry. */
export function primitivePlan(kind:PrimitiveKind,o:PrimitiveGeometry={},maxValueBytes=64*1024**2){
 if(!primitiveKinds.includes(kind))fail('Unknown primitive shape');assetOptions(o,allowed[kind],kind+' geometry');
 const detail=o.detail??1;if(!Number.isSafeInteger(detail)||detail<1)fail('detail must be a positive integer');
 if(o.size!==undefined)assetVector(o.size,'box size',Number.MIN_VALUE);
 for(const k of ['radius','height','tube'] as const)if(o[k]!==undefined)assetNumber(o[k]!,'geometry '+k,Number.MIN_VALUE);
 if((kind==='torus'||kind==='knot')&&(o.tube??(kind==='torus'?.22:.17))>=(o.radius??.8))fail('Tube must be smaller than radius');
 // IcosahedronGeometry's detail is linear subdivision (Three r186), not an exponential depth.
 const d=detail,vertices=kind==='box'?24:kind==='icosahedron'?60*d*d:kind==='knot'?(32*d+1)*(6*d+1):kind==='sphere'?(12*d+1)*(8*d+1):kind==='torus'?(20*d+1)*(8*d+1):kind==='capsule'?(12*d+1)*(12*d+1):(12*d+1)*6,
 indices=kind==='box'?36:vertices*6,plannedBytes=vertices*128+indices*8,budget=assetNumber(maxValueBytes,'maxValueBytes',1);
 if(!Number.isSafeInteger(plannedBytes)||plannedBytes>budget||vertices>LIMITS.vertices||indices>LIMITS.array)fail('Complete primitive geometry exceeds value budget or Graphics-v1 limits','E_CREATION_BUDGET');
 return {vertices,indices,plannedBytes,detail};
}
export function primitiveAsset(id:string,kind:PrimitiveKind,o:PrimitiveGeometry={},maxValueBytes?:number){
 const d=primitivePlan(kind,o,maxValueBytes).detail,r=o.radius??(kind==='sphere'?.7:kind==='capsule'?.35:.8),h=o.height??1.4;
 const g=kind==='box'?new BoxGeometry(...o.size??[1.2,1.2,1.2]):kind==='sphere'?new SphereGeometry(r,12*d,8*d):kind==='torus'?new TorusGeometry(r,o.tube??.22,8*d,20*d):kind==='cylinder'?new CylinderGeometry(r,r,h,12*d):kind==='cone'?new ConeGeometry(r,h,12*d):kind==='capsule'?new CapsuleGeometry(r,h,4*d,12*d):kind==='knot'?new TorusKnotGeometry(r,o.tube??.17,32*d,6*d):new IcosahedronGeometry(r,d-1);
 return geometryData(id,g,true);
}
