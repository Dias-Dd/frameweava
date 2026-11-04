import {Composition,Stage,Layer,ref,keyframes} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {sculptureScene} from 'spatial-creation-candidate';
// A complete shot. Change materials, motion and framing here; no buffers or matrices.
export const shot=defineNativeStage(()=>sculptureScene({
 camera:{orbit:{azimuth:18,elevation:14,speed:12},viewHeight:3.2},
 rotation:[0,keyframes([{frame:0,value:-8},{frame:23,value:8}]),0],
 objects:[
  {shape:'torus',geometry:{radius:.78,tube:.21},material:'copper',position:[-.58,.1,.1],rotation:[32,15,18],spin:[0,18,0]},
  {shape:'sphere',geometry:{radius:.42,detail:2},material:'ceramic',position:[.7,.42,-.15]},
  {shape:'icosahedron',geometry:{radius:.36},material:'chrome',position:[.48,-.58,.35],spin:[0,24,8]},
 ],
}));
export default Composition({id:'sculpture-shot',width:640,height:360,fps:24,durationInFrames:24,seed:37,children:[Stage({id:'shot',factory:shot,outputs:{surface:'surface'}}),Layer({source:ref('shot')})]});
