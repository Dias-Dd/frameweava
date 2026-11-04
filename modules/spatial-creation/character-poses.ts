import type {CharacterControls,CharacterRigOptions,CharacterAsset} from '../puppet-effects/native.ts';
import type {FrameContext,Signal} from '../../src/core/types.ts';
import type {AnimatedVec3} from './types.ts';import type {CharacterJoint} from './character-art.ts';
import {scalar,vector,fail} from './lifecycle.ts';
export type CharacterAction='bind'|'idle'|'wave'|'walk'|'run'|'jump'|'dance'|'point'|'reach';
export type CharacterJointMap=Partial<Record<CharacterJoint,string>>;
export interface FigurePose {move?:AnimatedVec3;rotate?:AnimatedVec3;scale?:AnimatedVec3}
export type CharacterEnd='leftHand'|'rightHand'|'leftFoot'|'rightFoot';
export interface FigureTarget {at:AnimatedVec3;weight?:Signal<number>;iterations?:number}
export interface FigureControls {
 joints?:CharacterJointMap;pose?:Partial<Record<CharacterJoint,FigurePose>>;
 targets?:Partial<Record<CharacterEnd,FigureTarget>>;
 /** Original raw controls, applied after the friendly controls. */
 controls?:CharacterControls;rig?:CharacterRigOptions;
}
export interface FigureMotion {amount?:Signal<number>;frequency?:Signal<number>;phase?:Signal<number>;target?:AnimatedVec3}
export type FigureRigSetup=Pick<FigureControls,'joints'|'rig'>&{
 pose?:Partial<Record<CharacterJoint,unknown>>;targets?:Partial<Record<CharacterEnd,unknown>>;
};
export const characterMotionDefaults={bind:{frequency:0},idle:{frequency:.65},wave:{frequency:1.1},walk:{frequency:1.1},run:{frequency:1.7},jump:{frequency:.7},dance:{frequency:1},point:{frequency:.55},reach:{frequency:.55}} as const;
const side=(name:CharacterEnd)=>name.startsWith('left')?'left':'right';
const chain=(name:CharacterEnd)=>name.endsWith('Hand')?[side(name)+'LowerArm',side(name)+'UpperArm']:[side(name)+'LowerLeg',side(name)+'UpperLeg'];
/** Resolve declared joint aliases only; never infer asset anatomy. */
export function figureRig(asset:CharacterAsset,o:FigureRigSetup,action:CharacterAction):CharacterRigOptions{
 const byId=new Set(asset.skeleton.bones.map(b=>b.id)),mapped=(name:string)=>o.joints?.[name as CharacterJoint]??name,requested=new Set(Object.keys(o.targets??{}));if(action==='point'||action==='reach')requested.add('rightHand');
 const required:Record<CharacterAction,CharacterJoint[]>={bind:[],idle:['hips','chest','head','leftUpperArm','rightUpperArm'],wave:['chest','head','rightUpperArm','rightLowerArm','rightHand'],walk:['hips','chest','leftUpperLeg','rightUpperLeg','leftLowerLeg','rightLowerLeg','leftUpperArm','rightUpperArm','leftLowerArm','rightLowerArm'],run:['hips','chest','leftUpperLeg','rightUpperLeg','leftLowerLeg','rightLowerLeg','leftUpperArm','rightUpperArm','leftLowerArm','rightLowerArm'],jump:['hips','leftUpperArm','rightUpperArm','leftUpperLeg','rightUpperLeg','leftLowerLeg','rightLowerLeg'],dance:['hips','chest','head','leftUpperArm','rightUpperArm','leftLowerArm','rightLowerArm','leftUpperLeg','rightUpperLeg'],point:['head'],reach:['head']};
 for(const name of [...required[action],...Object.keys(o.pose??{}),...Object.keys(o.joints??{})])if(!byId.has(mapped(name)))fail('Character asset needs declared joint mapping for '+name+' -> '+mapped(name),'E_CREATION_CHARACTER_JOINT');
 const chains=[...requested].map(raw=>{const name=raw as CharacterEnd;return {id:'figure.'+name,effector:mapped(name),links:chain(name).map(mapped),iterations:24};});
 const raw=o.rig?.chains??[],merged={...o.rig,chains:[...chains.filter(c=>!raw.some(r=>r.id===c.id)),...raw]};for(const c of merged.chains)for(const id of [c.effector,...c.links])if(!byId.has(id))fail('Character asset needs declared joint mapping for '+id,'E_CREATION_CHARACTER_JOINT');return merged;
}
/** Absolute-time author recipes over original stateless Three FK/CCD. */
export function figureControls(o:FigureControls&FigureMotion,action:CharacterAction,c:FrameContext):CharacterControls{
 const a=scalar(o.amount??1,c,'character amount',0,1),f=scalar(o.frequency??characterMotionDefaults[action].frequency,c,'character frequency',0),phase=scalar(o.phase??0,c,'character phase'),t=c.time*f*2*Math.PI+phase,s=Math.sin(t),q=Math.cos(t),bones:NonNullable<CharacterControls['bones']>={},targets:NonNullable<CharacterControls['targets']>={};
 const mapped=(name:CharacterJoint)=>o.joints?.[name]??name;
 const rot=(name:CharacterJoint,z:number)=>{bones[mapped(name)]={rotation:[0,0,z*a]};},move=(name:CharacterJoint,x:number,y:number)=>{bones[mapped(name)]={...bones[mapped(name)],translation:[x*a,y*a,0]};};
 if(action==='idle'){rot('chest',.025*s);rot('head',-.04*s);rot('leftUpperArm',.035*s);rot('rightUpperArm',-.035*s);move('hips',0,.015*(1-q));}
 if(action==='wave'){rot('rightUpperArm',1.45);rot('rightLowerArm',1.2+.25*s);rot('rightHand',.2*s);rot('head',-.06);rot('chest',.025*s);}
 if(action==='walk'||action==='run'){const fast=action==='run',swing=fast?.68:.38;rot('leftUpperLeg',swing*s);rot('rightUpperLeg',-swing*s);rot('leftLowerLeg',-(fast?.9:.45)*Math.max(0,-s));rot('rightLowerLeg',-(fast?.9:.45)*Math.max(0,s));rot('leftUpperArm',-swing*s);rot('rightUpperArm',swing*s);rot('leftLowerArm',fast?.9:.1);rot('rightLowerArm',fast?-.9:-.1);move('hips',0,(fast?.06:.025)*(1-Math.cos(t*2)));rot('chest',fast?-.08:.015*s);}
 if(action==='jump'){const u=(t/(2*Math.PI)%1+1)%1,h=Math.sin(Math.PI*u)**2;move('hips',0,h*.65);rot('leftUpperArm',-.8*h);rot('rightUpperArm',.8*h);rot('leftUpperLeg',.2*h);rot('rightUpperLeg',-.2*h);rot('leftLowerLeg',-.45*h);rot('rightLowerLeg',-.45*h);}
 if(action==='dance'){move('hips',.1*s,.045*(1-Math.cos(t*2)));rot('chest',.12*s);rot('head',-.1*s);rot('leftUpperArm',-.65-.25*q);rot('rightUpperArm',.65+.25*q);rot('leftLowerArm',-.5+.3*s);rot('rightLowerArm',.5+.3*s);rot('leftUpperLeg',.12*q);rot('rightUpperLeg',-.12*q);}
 if(action==='point'||action==='reach'){const at=o.target?vector(o.target,c,'character target'):action==='point'?[1,.5,0] as [number,number,number]:[.8+.1*s,.55+.25*q,0] as [number,number,number];targets['figure.rightHand']={position:at,weight:a};rot('head',-.045);}
 for(const [raw,p]of Object.entries(o.pose??{})){const name=mapped(raw as CharacterJoint),value=p!;bones[name]={...bones[name],...value.move?{translation:vector(value.move,c,'pose move')}:undefined,...value.rotate?{rotation:vector(value.rotate,c,'pose rotation')}:undefined,...value.scale?{scale:vector(value.scale,c,'pose scale')}:undefined};}
 for(const [name,v]of Object.entries(o.targets??{}))targets['figure.'+name]={position:vector(v!.at,c,'target '+name),weight:scalar(v!.weight??1,c,'target weight',0,1),iterations:v!.iterations};
 return {bones:{...bones,...o.controls?.bones},targets:{...targets,...o.controls?.targets}};
}
