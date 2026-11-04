import type {FrameContext,Signal} from '../../src/core/types.ts';
import type {MeshLighting} from '../skeletal-effects/native.ts';
import type {CreationColor} from './colors.ts';import {creationColor} from './colors.ts';
import {scalar,fail} from './lifecycle.ts';import {assetOptions} from './physics-assets.ts';
export type LightingPreset='studio'|'soft'|'dramatic'|'rim'|'sunset'|'moonlight'|'daylight'|'neon'|'warm'|'cool';
export interface LightingRigControls {intensity?:Signal<number>;rotation?:Signal<number>;ambient?:CreationColor;key?:CreationColor;fill?:CreationColor;rim?:CreationColor;keyIntensity?:Signal<number>;fillIntensity?:Signal<number>;rimIntensity?:Signal<number>}
export interface LightingRig extends LightingRigControls {preset:LightingPreset}
export type CreationLighting=MeshLighting|LightingPreset|LightingRig;
const rig=(ambient:[number,number,number],key:[number,number,number],fill:[number,number,number],rim:[number,number,number],power:[number,number,number],directions:[[number,number,number],[number,number,number],[number,number,number]]=[[-2,3,4],[3,1,2],[0,2,-2]]):MeshLighting=>({ambient,directional:directions.map((direction,i)=>({direction,color:[key,fill,rim][i],intensity:power[i]}))});
/** Scene-linear numeric recipes over the shipped directional GGX renderer.
 * No area-light, environment map, shadow or bounce-light implementation. */
const presets:Record<LightingPreset,MeshLighting>={
 studio:rig([.16,.18,.23],[1,.8,.6],[.25,.65,1],[.6,.9,1],[3.8,2.2,3]),
 soft:rig([.3,.32,.36],[1,.94,.88],[.65,.8,1],[.8,.9,1],[2.2,1.4,1.2],[[-2,3,5],[3,2,4],[0,3,-2]]),
 dramatic:rig([.025,.03,.045],[1,.72,.46],[.18,.35,.8],[.4,.65,1],[5,.3,2.8],[[-4,2,2],[3,1,1],[1,2,-3]]),
 rim:rig([.035,.045,.06],[.65,.8,1],[.3,.5,1],[1,.85,.65],[.7,.4,6],[[-2,2,4],[3,0,3],[-1,2,-3]]),
 sunset:rig([.1,.04,.035],[1,.3,.08],[.22,.32,1],[1,.55,.2],[4.8,1.4,2.4],[[-4,1,3],[3,2,3],[0,2,-3]]),
 moonlight:rig([.015,.025,.06],[.3,.55,1],[.18,.28,.65],[.65,.8,1],[3,.4,2],[[-2,4,2],[3,0,3],[1,2,-3]]),
 daylight:rig([.24,.3,.38],[1,.95,.85],[.45,.65,1],[.8,.9,1],[3.2,1.5,1.5],[[-2,5,3],[3,2,2],[0,3,-3]]),
 neon:rig([.02,.015,.045],[1,.06,.35],[.04,.65,1],[.6,.12,1],[4,3.2,4],[[-3,1,3],[3,1,2],[0,2,-3]]),
 warm:rig([.18,.11,.065],[1,.65,.3],[.7,.45,.25],[1,.85,.55],[3.6,1.4,2.5]),
 cool:rig([.07,.12,.2],[.6,.8,1],[.15,.5,1],[.55,.9,1],[3.2,2,3]),
};
const keys=['intensity','rotation','ambient','key','fill','rim','keyIntensity','fillIntensity','rimIntensity'];
export function lightingDefaults(name:LightingPreset):MeshLighting{if(!Object.hasOwn(presets,name))fail('Unknown lighting preset: '+String(name));return structuredClone(presets[name]);}
export function lightingRig(preset:LightingPreset='studio',o:LightingRigControls={}):LightingRig{lightingDefaults(preset);assetOptions(o,keys,'lighting rig');let copy:LightingRigControls;try{copy=structuredClone(o);}catch{fail('Lighting rig controls require serializable Core Signals');}return {preset,...copy};}
export function studioLighting(o:LightingRigControls={}){return lightingRig('studio',o);}
export function softLighting(o:LightingRigControls={}){return lightingRig('soft',o);}
export function dramaticLighting(o:LightingRigControls={}){return lightingRig('dramatic',o);}
export function rimLighting(o:LightingRigControls={}){return lightingRig('rim',o);}
export function sunsetLighting(o:LightingRigControls={}){return lightingRig('sunset',o);}
export function moonlightLighting(o:LightingRigControls={}){return lightingRig('moonlight',o);}
export function daylightLighting(o:LightingRigControls={}){return lightingRig('daylight',o);}
export function neonLighting(o:LightingRigControls={}){return lightingRig('neon',o);}
export function warmLighting(o:LightingRigControls={}){return lightingRig('warm',o);}
export function coolLighting(o:LightingRigControls={}){return lightingRig('cool',o);}
export function checkCreationLighting(value:CreationLighting|undefined){if(value===undefined)return;if(typeof value==='string'){lightingDefaults(value);return;}assetOptions(value,['ambient','directional','preset',...keys],'creation lighting');if('preset'in value){lightingDefaults(value.preset);assetOptions(value,['preset',...keys],'lighting rig');}}
/** Preserve the original raw/default MeshLighting object verbatim. Only an
 * explicit preset opts into frame sampling and authored light recoloring. */
export function sampleLighting(value:CreationLighting|undefined,c:FrameContext,fallback:MeshLighting):MeshLighting{
 if(value===undefined)return fallback;if(typeof value!=='string'&&!('preset'in value))return value;
 const o=typeof value==='string'?{preset:value}:value,data=lightingDefaults(o.preset),gain=scalar(o.intensity??1,c,'light intensity',0),angle=scalar(o.rotation??0,c,'light yaw')*Math.PI/180,cos=Math.cos(angle),sin=Math.sin(angle);
 const lights=data.directional!.map((light,i)=>{const color=[o.key,o.fill,o.rim][i],intensity=[o.keyIntensity,o.fillIntensity,o.rimIntensity][i],v=light.direction;return {direction:[v[0]*cos+v[2]*sin,v[1],-v[0]*sin+v[2]*cos] as [number,number,number],color:color===undefined?light.color:creationColor(color,c,'light color'),intensity:scalar(intensity??light.intensity??1,c,'light power',0)*gain};});
 if(lights.some(l=>!Number.isFinite(l.intensity)||l.direction.some(v=>!Number.isFinite(v))))fail('Lighting exceeds finite range');return {ambient:o.ambient===undefined?data.ambient:creationColor(o.ambient,c,'ambient color'),directional:lights};
}
