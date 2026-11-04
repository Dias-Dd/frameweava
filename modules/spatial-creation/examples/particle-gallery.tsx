import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {particleField,snowField,sparkField,bubbleField,fireflyField,dustField,confettiField,energyField,starField,petalField} from 'spatial-creation-candidate';
export const generic=defineNativeStage(()=>particleField()),snow=defineNativeStage(()=>snowField()),sparks=defineNativeStage(()=>sparkField());
export const bubbles=defineNativeStage(()=>bubbleField()),fireflies=defineNativeStage(()=>fireflyField()),dust=defineNativeStage(()=>dustField());
export const confetti=defineNativeStage(()=>confettiField()),energy=defineNativeStage(()=>energyField({finish:{glow:{radius:2,intensity:.3,threshold:1}}}));
export const stars=defineNativeStage(()=>starField()),petals=defineNativeStage(()=>petalField());
export default Composition({id:'particle-field-gallery',width:1600,height:400,fps:24,durationInFrames:24,seed:37,background:'#101927',children:[
 ...Object.entries({generic,snow,sparks,bubbles,fireflies,dust,confetti,energy,stars,petals}).flatMap(([id,factory],i)=>[
  Stage({id,factory,width:320,height:200,outputs:{surface:'surface'}}),Layer({source:ref(id),x:i%5*320,y:Math.floor(i/5)*200}),
 ]),
]});
