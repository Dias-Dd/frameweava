import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {stackCreations,gradientBackground,starField,animateCreation,staggerCreations,placeCreation,torus3D,sphere3D,icosahedron3D} from 'spatial-creation-candidate';
// Three authored objects, an entrance preset, a group motion and an exit.
// Change interval, spring or materials; no buffers, matrices or cleanup.
export const shot=defineNativeStage(()=>stackCreations([
 gradientBackground({center:'#24364c',edge:'#040a16'}),
 starField({initialCount:24,rate:0,radius:.012,opacity:.2}),
 animateCreation(staggerCreations([
  placeCreation(torus3D({radius:.82,tube:.2,detail:2,material:'copper',ink:'#ecab7a',rotation:[30,15,12],spin:[0,18,0],camera:{position:[0,0,6],viewHeight:3.2}}),{x:-86,y:10}),
  placeCreation(icosahedron3D({radius:.48,material:'chrome',rotation:[15,35,10],spin:[0,-22,8],camera:{position:[0,0,6],viewHeight:3.2}}),{x:117,y:40}),
  placeCreation(sphere3D({radius:.27,detail:2,material:'ceramic',ink:'#36b8c9',camera:{position:[0,0,6],viewHeight:3.2}}),{x:47,y:-82}),
 ],{interval:2,enter:{kind:'spring',duration:5,scale:.5,spring:{damping:16}}}),
 {enter:false,idle:{kind:'float',offset:[0,5],frequency:.5},exit:{kind:'fade',at:20,duration:3}}),
],{finish:{vignette:.14}}));
export default Composition({id:'motion-shot',width:640,height:360,fps:24,durationInFrames:24,seed:37,children:[Stage({id:'shot',factory:shot,outputs:{surface:'surface'}}),Layer({source:ref('shot')})]});
