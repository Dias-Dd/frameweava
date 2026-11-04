import {Composition,Stage,Layer,Resource,ref} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {imageCreation,imageCharacterWave} from 'spatial-creation-candidate';
import {joints} from './image-character-joints';
export const source=defineNativeStage(()=>imageCreation({image:{resource:'actor',size:[400,600]}}));
export const actor=defineNativeStage(()=>imageCharacterWave({image:'art',imageSize:[400,600],joints}));
export default Composition({id:'image-character-input',width:640,height:360,fps:24,durationInFrames:24,background:'#17212b',children:[
 Resource({id:'actor',kind:'image',src:'./image-character.png'}),
 Stage({id:'source',factory:source,width:400,height:600,outputs:{surface:'surface'}}),
 Stage({id:'actor',factory:actor,inputs:{art:ref('source')},inputTypes:{art:'surface'},outputs:{surface:'surface'}}),
 Layer({source:ref('actor')}),
]});
