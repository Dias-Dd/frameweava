import {Composition,Stage,Layer,ref,keyframes} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {stackCreations,gradientBackground,starField,silkRibbon,placeCreation,fadeCreation,dustField} from 'spatial-creation-candidate';

// One Stage, ordinary function composition. Change the object, movement or look;
// no GPU buffers, matrices, temporary images or disposal in the shot code.
export const shot=defineNativeStage(()=>stackCreations([
 gradientBackground({center:[.02,.038,.075],edge:[.001,.002,.006]}),
 starField({initialCount:55,rate:0,radius:.023,opacity:.3}),
 placeCreation(silkRibbon({strands:2,segments:56,width:.4,twist:3.8,
  ink:[.92,.24,.065],roughness:.28,metalness:.45}),{
  scale:.86,rotation:keyframes([{frame:0,value:-7},{frame:23,value:5}]),x:18,
 }),
 fadeCreation(dustField({initialCount:65,rate:0}),.2),
],{finish:'cinema'}));
export default Composition({id:'composed-ribbon',width:640,height:360,fps:24,durationInFrames:24,seed:37,
 children:[Stage({id:'shot',factory:shot,outputs:{surface:'surface'}}),Layer({source:ref('shot')})]});
