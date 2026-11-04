import {Composition,Stage,Layer,Resource,ref} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {imageCharacter,imageCharacterIdle,imageCharacterWave,imageCharacterWalk,imageCharacterRun,imageCharacterJump,imageCharacterDance,imageCharacterPoint,imageCharacterReach,imageCharacterScene} from 'spatial-creation-candidate';
import {joints} from './image-character-joints';
const options={image:{resource:'actor',size:[400,600] as const},joints};
export const bind=defineNativeStage(()=>imageCharacter(options));
export const idle=defineNativeStage(()=>imageCharacterIdle(options));
export const wave=defineNativeStage(()=>imageCharacterWave(options));
export const walk=defineNativeStage(()=>imageCharacterWalk(options));
export const run=defineNativeStage(()=>imageCharacterRun(options));
export const jump=defineNativeStage(()=>imageCharacterJump(options));
export const dance=defineNativeStage(()=>imageCharacterDance(options));
export const point=defineNativeStage(()=>imageCharacterPoint(options));
export const reach=defineNativeStage(()=>imageCharacterReach(options));
export const scene=defineNativeStage(()=>imageCharacterScene({actor:options}));
export default Composition({id:'image-character-gallery',width:1600,height:480,fps:24,durationInFrames:24,background:'#2f414a',children:[
 Resource({id:'actor',kind:'image',src:'./image-character.png'}),
 ...Object.entries({bind,idle,wave,walk,run,jump,dance,point,reach,scene}).flatMap(([id,factory],i)=>[
  Stage({id,factory,width:320,height:240,outputs:{surface:'surface'}}),Layer({source:ref(id),x:i%5*320,y:Math.floor(i/5)*240}),
 ]),
]});
