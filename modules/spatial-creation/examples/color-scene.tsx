import {Composition,Stage,Layer,ref,keyframes} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {ribbonScene} from 'spatial-creation-candidate';
// Pick colors directly. Shape, motion and lighting retain the creator defaults.
export const shot=defineNativeStage(()=>ribbonScene({
 ribbon:{strands:2,width:.44,ink:keyframes([{frame:0,value:'#ff8b4a'},{frame:23,value:'#48cef0'}])},
 background:{center:'#112a3c',edge:'#020812'},
 particles:{style:{ink:'#ffe3ae'}},
 finish:{preset:'cinema',tint:{black:'#020507',white:'#fff0d5',amount:.08}},
}));
export default Composition({id:'color-shot',width:640,height:360,fps:24,durationInFrames:24,seed:37,children:[Stage({id:'shot',factory:shot,outputs:{surface:'surface'}}),Layer({source:ref('shot')})]});
