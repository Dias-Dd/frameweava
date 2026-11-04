import {Composition,Stage,Layer,ref,keyframes} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {electricScene} from 'spatial-creation-candidate';

// Describe the bolt and its motion. Geometry, materials, camera, GPU resources,
// backdrop, stars and finishing are automatic.
export const shot=defineNativeStage(()=>electricScene({
 bolt:{end:[1.25,keyframes([{frame:0,value:-.85},{frame:23,value:-.45}]),0],
  ink:[.22,1.8,4],amplitude:.16,speed:4},
}));
export default Composition({id:'electric-scene',width:640,height:360,fps:24,durationInFrames:24,seed:37,
 children:[Stage({id:'shot',factory:shot,outputs:{surface:'surface'}}),Layer({source:ref('shot')})]});
