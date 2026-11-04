import type {Signal} from '../../src/core/types.ts';import type {AnimatedVec3} from './types.ts';import type {ObjectCameraConfig} from './object-controls.ts';import {assetOptions} from './physics-assets.ts';import {fail} from './lifecycle.ts';
export type CameraView='front'|'back'|'left'|'right'|'top'|'bottom'|'isometric'|'hero'|'perspective'|'orbit';
export interface OrthographicViewControls {target?:AnimatedVec3;up?:readonly [number,number,number];near?:number;far?:number;viewHeight?:Signal<number>}
export type PerspectiveViewControls=Omit<OrthographicViewControls,'viewHeight'>&{verticalFov?:Signal<number>};
export interface OrbitViewControls extends OrthographicViewControls {radius?:Signal<number>;azimuth?:Signal<number>;elevation?:Signal<number>;speed?:Signal<number>}
export type CameraViewControls<N extends CameraView>=N extends 'perspective'?PerspectiveViewControls:N extends 'orbit'?OrbitViewControls:OrthographicViewControls;
const views:Record<CameraView,ObjectCameraConfig>={front:{position:[0,0,6]},back:{position:[0,0,-6]},left:{position:[-6,0,0]},right:{position:[6,0,0]},top:{position:[0,6,0],up:[0,0,-1]},bottom:{position:[0,-6,0],up:[0,0,1]},isometric:{position:[4,4,4]},hero:{position:[3,2,6]},perspective:{projection:'perspective',position:[3,2,6],verticalFov:35},orbit:{orbit:{radius:7,azimuth:24,elevation:16,speed:8}}};
/** Plain existing camera data; no device, matrix, clock, session or GPU handle. */
export function cameraView<N extends CameraView>(name:N,options:CameraViewControls<N>={} as CameraViewControls<N>):ObjectCameraConfig{
 if(!Object.hasOwn(views,name))fail('Unknown camera view: '+String(name));assetOptions(options,['target','up','near','far',...(name==='perspective'?['verticalFov']:['viewHeight']),...name==='orbit'?['radius','azimuth','elevation','speed']:[]],'camera view');let o:any;try{o=Object.fromEntries(Object.entries(structuredClone(options)).filter(([,v])=>v!==undefined));}catch{fail('Camera view controls require serializable Core Signals');}
 const base=structuredClone(views[name]);if(name==='orbit'){const {radius,azimuth,elevation,speed,...shared}=o;return {...base,...shared,orbit:{radius:radius??7,azimuth:azimuth??24,elevation:elevation??16,speed:speed??8}};}return {...base,...o};
}
