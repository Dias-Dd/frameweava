import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {hangingCloth,windFlag,drapedCloth,bouncingBalls,dominoes} from 'spatial-creation-candidate';
export const hanging=defineNativeStage(()=>hangingCloth()),flag=defineNativeStage(()=>windFlag());
export const drape=defineNativeStage(()=>drapedCloth()),balls=defineNativeStage(()=>bouncingBalls()),domino=defineNativeStage(()=>dominoes());
export default Composition({id:'physics-gallery',width:1600,height:240,fps:24,durationInFrames:24,background:'#101927',
 children:Object.entries({hanging,flag,drape,balls,domino}).flatMap(([id,factory],i)=>[
  Stage({id,factory,width:320,height:240,outputs:{surface:'surface'}}),Layer({source:ref(id),x:i*320}),
 ])});
