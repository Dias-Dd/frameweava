import {Composition,Stage,Layer,Resource,ref,keyframes} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {imageCharacterScene} from 'spatial-creation-candidate';
import {joints} from './image-character-joints';
export const shot=defineNativeStage(()=>imageCharacterScene({
 actor:{image:{resource:'actor',size:[400,600]},joints,
  pose:{head:{rotate:keyframes([{frame:0,value:-4},{frame:23,value:4}])}}},
 action:'wave',
}));
export default Composition({id:'image-character-shot',width:640,height:360,fps:24,durationInFrames:24,children:[
 Resource({id:'actor',kind:'image',src:'./image-character.png'}),
 Stage({id:'shot',factory:shot,outputs:{surface:'surface'}}),Layer({source:ref('shot')}),
]});
