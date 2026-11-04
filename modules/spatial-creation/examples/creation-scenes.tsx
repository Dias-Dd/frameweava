import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {starlitRibbonScene,celebrationScene,energyScene} from 'spatial-creation-candidate';
export const ribbon=defineNativeStage(()=>starlitRibbonScene());
export const celebration=defineNativeStage(()=>celebrationScene());
export const energy=defineNativeStage(()=>energyScene());
export default Composition({id:'creation-scenes',width:960,height:240,fps:24,durationInFrames:24,seed:37,children:[
 ...Object.entries({ribbon,celebration,energy}).flatMap(([id,factory],i)=>[
  Stage({id,factory,width:320,height:240,outputs:{surface:'surface'}}),Layer({source:ref(id),x:i*320}),
 ]),
]});
