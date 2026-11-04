import {Composition,Stage,Layer,ref,keyframes} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {ribbonScene} from 'spatial-creation-candidate';

export const shot=defineNativeStage(()=>ribbonScene({
 ribbon:{width:.5,speed:.7,twist:keyframes([{frame:0,value:1.5},{frame:23,value:3.1}])},
 finish:{preset:'cinema',glow:{intensity:.25},grain:.001},
}));
export default Composition({id:'finished-silk',width:640,height:360,fps:24,durationInFrames:24,
 children:[Stage({id:'shot',factory:shot,outputs:{surface:'surface'}}),Layer({source:ref('shot')})]});
