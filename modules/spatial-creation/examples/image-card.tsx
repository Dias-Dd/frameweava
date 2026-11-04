import {Composition,Stage,Layer,Resource,ref,keyframes} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {stackCreations,gradientBackground,imageCreation} from 'spatial-creation-candidate';
export const shot=defineNativeStage(()=>stackCreations([
 gradientBackground({center:[.065,.11,.12],edge:[.003,.008,.012]}),
 imageCreation({image:{resource:'plant',size:[320,400]},fit:'contain',scale:.85,
  rotation:keyframes([{frame:0,value:-4},{frame:23,value:4}])}),
],{finish:'warm'}));
export default Composition({id:'image-card',width:640,height:360,fps:24,durationInFrames:24,children:[
 Resource({id:'plant',kind:'image',src:'./puppet-plant.png'}),
 Stage({id:'shot',factory:shot,outputs:{surface:'surface'}}),Layer({source:ref('shot')}),
]});
