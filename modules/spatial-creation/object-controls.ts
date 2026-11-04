import {Matrix4,Quaternion,Euler,Vector3} from 'three';
import type {FrameContext,Signal} from '../../src/core/types.ts';
import type {SpatialCamera} from '../spatial-fields/types.ts';
import type {AnimatedVec3} from './types.ts';
import {scalar,vector,fail} from './lifecycle.ts';
import {assetOptions} from './physics-assets.ts';
import {cameraView,type CameraView} from './view-presets.ts';

export interface ObjectTransform {
 /** Mesh-local meters. Euler XYZ degrees, spin in degrees/second. */
 position?:AnimatedVec3;rotation?:AnimatedVec3;spin?:AnimatedVec3;
 scale?:Signal<number>|AnimatedVec3;
}
export interface ObjectOrbit {radius?:Signal<number>;azimuth?:Signal<number>;elevation?:Signal<number>;speed?:Signal<number>}
export type ObjectCameraConfig={target?:AnimatedVec3;up?:readonly [number,number,number];near?:number;far?:number}&
 ({projection?:'orthographic';viewHeight?:Signal<number>;verticalFov?:never}|{projection:'perspective';verticalFov?:Signal<number>;viewHeight?:never})&
 ({position?:AnimatedVec3;orbit?:never}|{orbit:ObjectOrbit;position?:never});
export type ObjectCamera=ObjectCameraConfig;
export type CreationCamera=ObjectCameraConfig|CameraView;
export const objectTransformKeys=['position','rotation','spin','scale'];
const radians=Math.PI/180;
export function checkObjectCamera(o:CreationCamera={}){
 if(typeof o==='string'){cameraView(o);return;}
 assetOptions(o,['projection','position','target','up','near','far','viewHeight','verticalFov','orbit'],'object camera');
 if(o.projection!==undefined&&!['orthographic','perspective'].includes(o.projection))fail('Camera projection must be orthographic or perspective');
 if(o.orbit!==undefined){assetOptions(o.orbit,['radius','azimuth','elevation','speed'],'camera orbit');if(o.position!==undefined)fail('Camera chooses explicit position or orbit, not both');}
 if((o.projection??'orthographic')==='orthographic'&&o.verticalFov!==undefined||(o.projection??'orthographic')==='perspective'&&o.viewHeight!==undefined)fail('Use viewHeight for orthographic or verticalFov for perspective');
}
export function objectCamera(o:CreationCamera|undefined,c:FrameContext):SpatialCamera{
 const p=typeof o==='string'?cameraView(o):o??{},target=vector(p.target??[0,0,0],c,'camera target');let position=vector(p.position??[3,2,6],c,'camera position');
 if(p.orbit){const r=scalar(p.orbit.radius??7,c,'orbit radius',Number.MIN_VALUE),a=(scalar(p.orbit.azimuth??24,c,'azimuth')+c.time*scalar(p.orbit.speed??8,c,'orbit speed'))*radians,e=scalar(p.orbit.elevation??16,c,'elevation',-89.99,89.99)*radians;position=[target[0]+r*Math.cos(e)*Math.sin(a),target[1]+r*Math.sin(e),target[2]+r*Math.cos(e)*Math.cos(a)];}
 const common={position,target,up:[...(p.up??[0,1,0])] as [number,number,number],near:p.near??.01,far:p.far??100};
 return p.projection==='perspective'?{...common,projection:'perspective',verticalFov:scalar(p.verticalFov??35,c,'verticalFov',Number.MIN_VALUE,179.99)}:{...common,projection:'orthographic',viewHeight:scalar(p.viewHeight??3.5,c,'viewHeight',Number.MIN_VALUE)};
}
export function objectModel(o:ObjectTransform,c:FrameContext){
 const position=vector(o.position??[0,0,0],c,'position'),rotation=vector(o.rotation??[0,0,0],c,'rotation'),spin=vector(o.spin??[0,0,0],c,'spin');
 const s=Array.isArray(o.scale)?vector(o.scale as AnimatedVec3,c,'scale'):Array(3).fill(scalar(o.scale as Signal<number>??1,c,'scale')) as [number,number,number],visible=s.every(v=>v!==0);
 const matrix=new Matrix4().compose(new Vector3(...position),new Quaternion().setFromEuler(new Euler(...rotation.map((v,i)=>(v+c.time*spin[i])*radians) as [number,number,number],'XYZ')),new Vector3(...visible?s:[1,1,1]));
 if(matrix.elements.some(v=>!Number.isFinite(v)))fail('Object transform exceeds finite matrix range');
 return {model:matrix.elements,visible};
}
