import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {starField,energyField} from 'spatial-creation-candidate';
export const stars=defineNativeStage(()=>starField({initialCount:95,opacity:.45}));
export const energy=defineNativeStage(()=>energyField({backgroundInput:'sky',finish:{glow:{radius:2,intensity:.25,threshold:1.2}}}));
export default Composition({id:'energy-among-stars',width:640,height:360,fps:24,durationInFrames:24,seed:37,background:'#080d18',children:[
 Stage({id:'stars',factory:stars,outputs:{surface:'surface'}}),
 Stage({id:'energy',factory:energy,inputs:{sky:ref('stars')},inputTypes:{sky:'surface'},outputs:{surface:'surface'}}),
 Layer({source:ref('energy')}),
]});
