import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {puppetCharacter,characterIdle,characterWave,characterWalk,characterRun,characterJump,characterDance,characterPoint,characterReach,characterScene} from 'spatial-creation-candidate';
export const bind=defineNativeStage(()=>puppetCharacter());
export const idle=defineNativeStage(()=>characterIdle());
export const wave=defineNativeStage(()=>characterWave());
export const walk=defineNativeStage(()=>characterWalk());
export const run=defineNativeStage(()=>characterRun());
export const jump=defineNativeStage(()=>characterJump());
export const dance=defineNativeStage(()=>characterDance());
export const point=defineNativeStage(()=>characterPoint());
export const reach=defineNativeStage(()=>characterReach());
export const scene=defineNativeStage(()=>characterScene());
export default Composition({id:'paper-character-gallery',width:1600,height:480,fps:24,durationInFrames:24,seed:37,background:'#2f414a',children:[
 ...Object.entries({bind,idle,wave,walk,run,jump,dance,point,reach,scene}).flatMap(([id,factory],i)=>[
  Stage({id,factory,width:320,height:240,outputs:{surface:'surface'}}),Layer({source:ref(id),x:i%5*320,y:Math.floor(i/5)*240}),
 ]),
]});
