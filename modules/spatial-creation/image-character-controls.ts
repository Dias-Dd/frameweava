import type {CharacterControls} from '../puppet-effects/native.ts';
import type {FrameContext,Signal} from '../../src/core/types.ts';
import type {CharacterJoint} from './character-art.ts';
import type {CharacterAction,CharacterEnd,FigureControls,FigureMotion} from './character-poses.ts';
import {figureControls,characterMotionDefaults} from './character-poses.ts';
import {scalar,fail} from './lifecycle.ts';
import type {imageCharacterLayout} from './image-character-layout.ts';
export type ImageCharacterXY=readonly [Signal<number>,Signal<number>];
export interface ImageJointPose {move?:ImageCharacterXY;rotate?:Signal<number>;scale?:ImageCharacterXY}
export interface ImageJointTarget {at:ImageCharacterXY;weight?:Signal<number>;iterations?:number}
export interface ImageCharacterControls {
 pose?:Partial<Record<CharacterJoint,ImageJointPose>>;
 targets?:Partial<Record<CharacterEnd,ImageJointTarget>>;
 controls?:CharacterControls;rig?:FigureControls['rig'];
 amount?:Signal<number>;frequency?:Signal<number>;phase?:Signal<number>;
 target?:ImageCharacterXY;
}
export function imageXY(value:ImageCharacterXY,c:FrameContext,name:string):[number,number]{if(!Array.isArray(value)||value.length!==2)fail(name+' requires two scalar Signals');return value.map((v,i)=>scalar(v,c,name+'['+i+']')) as [number,number];}
/** Image controls use right/down UV offsets and clockwise degrees. Convert
 * explicitly into the original rig's meter/+Y-up/radian controls. */
export function imageFigureControls(layout:ReturnType<typeof imageCharacterLayout>,o:ImageCharacterControls,action:CharacterAction,c:FrameContext):CharacterControls{
 const [w,h]=layout.size,amount=scalar(o.amount??1,c,'character amount',0,1),frequency=scalar(o.frequency??characterMotionDefaults[action].frequency,c,'character frequency',0),phase=scalar(o.phase??0,c,'character phase'),t=c.time*frequency*2*Math.PI+phase;
 const config:FigureControls&FigureMotion={amount,frequency,phase};
 if(action==='point'||action==='reach'){const shoulder=layout.asset.skeleton.bones.find(b=>b.id==='rightUpperArm')!,elbow=layout.asset.skeleton.bones.find(b=>b.id==='rightLowerArm')!,hand=layout.asset.skeleton.bones.find(b=>b.id==='rightHand')!,a=shoulder.bindMatrix.slice(12,15),b=elbow.bindMatrix.slice(12,15),d=hand.bindMatrix.slice(12,15),length=Math.hypot(...a.map((v,k)=>v-b[k]))+Math.hypot(...b.map((v,k)=>v-d[k])),direction=Math.sign(d[0]-a[0])||1;
  config.target=o.target?layout.world(imageXY(o.target,c,'image target')):[a[0]+direction*length*(action==='point'?.9:.7+.08*Math.sin(t)),a[1]+length*(action==='point'?0:.1+.25*Math.cos(t)),0];
 }
 const result=figureControls(config,action,c);
 for(const value of Object.values(result.bones??{}))if(value.translation)value.translation=(value.translation as number[]).map(v=>v*h/2.5) as [number,number,number];
 for(const [name,p]of Object.entries(o.pose??{})){const out={...result.bones?.[name]};if(p!.move){const [x,y]=imageXY(p!.move,c,'joint move');out.translation=[x*w,-y*h,0];}if(p!.rotate!==undefined)out.rotation=[0,0,-scalar(p!.rotate,c,'joint rotation')*Math.PI/180];if(p!.scale){const [x,y]=imageXY(p!.scale,c,'joint scale');out.scale=[x,y,x===y?x:1];}result.bones??={};result.bones[name]=out;}
 for(const [name,p]of Object.entries(o.targets??{})){result.targets??={};result.targets['figure.'+name]={position:layout.world(imageXY(p!.at,c,'joint target')),weight:scalar(p!.weight??1,c,'target weight',0,1),iterations:p!.iterations};}
 return {bones:{...result.bones,...o.controls?.bones},targets:{...result.targets,...o.controls?.targets}};
}
