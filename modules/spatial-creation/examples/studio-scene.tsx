import {Composition,Stage,Layer,ref,keyframes} from '@frameweave/engine';import {defineNativeStage} from '@frameweave/engine/native';
import {sculptureScene,neonLighting,cameraView} from 'spatial-creation-candidate';
// Describe the shot's view, lighting mood and materials; the existing Native
// renderer still owns geometry, shading and GPU resources.
export const shot=defineNativeStage(()=>sculptureScene({
 camera:cameraView('orbit',{azimuth:16,elevation:12,speed:9,viewHeight:3.2}),
 lighting:neonLighting({rotation:keyframes([{frame:0,value:-12},{frame:23,value:12}]),intensity:.85}),
 objects:[
  {shape:'torus',geometry:{radius:.77,tube:.2,detail:2},material:'gold',position:[-.55,.08,.1],rotation:[30,15,14],spin:[0,18,0]},
  {shape:'sphere',geometry:{radius:.4,detail:2},material:'porcelain',position:[.72,.4,-.1]},
  {shape:'icosahedron',geometry:{radius:.3},material:'silver',position:[.48,-.55,.3],spin:[0,24,8]},
 ],background:{center:'#1e1838',edge:'#030711'},finish:{vignette:.16},
}));
export default Composition({id:'studio-shot',width:640,height:360,fps:24,durationInFrames:24,seed:37,children:[Stage({id:'shot',factory:shot,outputs:{surface:'surface'}}),Layer({source:ref('shot')})]});
