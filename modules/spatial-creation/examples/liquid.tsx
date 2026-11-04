import {Composition,Stage,Layer,ref} from '@frameweave/engine';import {defineNativeStage} from '@frameweave/engine/native';
import {liquidScene,liquidBox,liquidMaterial,liquidSphereObstacle} from 'spatial-liquid-candidate';
export const water=defineNativeStage(init=>liquidScene(init,{
 particles:liquidBox({center:[-.35,.3,0],size:[.6,.6,.48],spacing:.12}),
 material:liquidMaterial({spacing:.12,iterations:4,viscosity:.03,surfaceTension:.005}),substeps:2,
 gravity:[0,-4,0],bounds:[[-.8,-1,-.5],[.8,1,.5]],obstacles:[liquidSphereObstacle({center:[.3,-.75,0],radius:.23})],
 dimensions:[48,48,32],color:[.04,.4,.7],absorption:[3,.8,.4],
 camera:{projection:'orthographic',position:[1.6,1.15,3],target:[0,-.3,0],viewHeight:2.5,near:.01,far:20},
}));
export default Composition({id:'liquid-shot',width:640,height:360,fps:24,durationInFrames:24,background:'#071323',children:[Stage({id:'water',factory:water,outputs:{surface:'surface'}}),Layer({source:ref('water')})]});
