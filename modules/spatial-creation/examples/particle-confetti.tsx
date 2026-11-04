import {Composition,Stage,Layer,ref,keyframes} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {confettiField} from 'spatial-creation-candidate';
// No GPU buffers, geometry, sprite texture, matrices or cleanup in authored code.
export const confetti=defineNativeStage(()=>confettiField({
 initialCount:130,rate:35,wind:[.08,0,0],
 radius:keyframes([{frame:0,value:.045},{frame:23,value:.065}]),
}));
export default Composition({id:'confetti-shot',width:640,height:360,fps:24,durationInFrames:24,seed:37,background:'#101927',children:[
 Stage({id:'confetti',factory:confetti,outputs:{surface:'surface'}}),Layer({source:ref('confetti')}),
]});
