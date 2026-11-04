import {Composition,Stage,Layer,ref,keyframes} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {characterScene} from 'spatial-creation-candidate';
// Change action to idle/walk/run/jump/dance/point/reach. The editable artwork,
// skeleton, camera, palette and temporary GPU resources are automatic.
export const shot=defineNativeStage(()=>characterScene({
 action:'wave',
 actor:{palette:{shirt:[.055,.4,.54]},frequency:keyframes([{frame:0,value:.8},{frame:23,value:1.2}])},
}));
export default Composition({id:'hello-paper-character',width:640,height:360,fps:24,durationInFrames:24,seed:37,
 children:[Stage({id:'shot',factory:shot,outputs:{surface:'surface'}}),Layer({source:ref('shot')})]});
