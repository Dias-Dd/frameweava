import {Composition,Stage,Layer,ref,keyframes} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {stackCreations,gradientBackground,placeCreation,characterWave,neonRing,outlineCreation,shadowCreation,glowCreation} from 'spatial-creation-candidate';
// Add effects to an object in authored order, with ordinary function calls.
export const shot=defineNativeStage(()=>stackCreations([
 gradientBackground({center:'#304b63',edge:'#081222'}),
 placeCreation(shadowCreation(outlineCreation(
  characterWave({palette:{shirt:'#20bad2',pants:'#1b344c'}}),
  {width:keyframes([{frame:0,value:1.5},{frame:23,value:3}]),color:'#ffedbf'}),
  {radius:5,offset:[8,12],opacity:.55}),{x:-125,scale:.86}),
 placeCreation(glowCreation(neonRing({ink:[.2,2,3],finish:false}),
  {radius:5,threshold:.5,intensity:.8}),{x:140,scale:.62}),
],{finish:{vignette:.16}}));
export default Composition({id:'effected-shot',width:640,height:360,fps:24,durationInFrames:24,seed:37,children:[Stage({id:'shot',factory:shot,outputs:{surface:'surface'}}),Layer({source:ref('shot')})]});
