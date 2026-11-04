import {Composition,Stage,Layer,ref,keyframes} from '@frameweave/engine';import {defineNativeStage} from '@frameweave/engine/native';
import {collidingCloth,collisionSphere,collisionPlane} from 'spatial-creation-candidate';
export const cloth=defineNativeStage(()=>collidingCloth({
 cloth:{fixedVertices:['r0c0','r0c7'],radius:.015},
 physics:{gravity:[0,-3,0],substeps:4,iterations:16,selfCollision:{friction:.3,maxWork:3000000},colliders:[
  collisionSphere({radius:.44,center:[keyframes([{frame:0,value:-.3},{frame:23,value:.25}]),-.08,0],friction:.4}),
  collisionPlane({normal:[0,1,0],offset:-.8,friction:.5}),
 ]},ink:[.025,.42,.7],roughness:.35,metalness:.12,camera:{projection:'perspective',verticalFov:42,near:.1,far:100,position:[2,1.6,4],target:[0,0,0]},
}));
export default Composition({id:'contact-physics',width:640,height:360,fps:24,durationInFrames:24,background:'#071322',children:[Stage({id:'cloth',factory:cloth,outputs:{surface:'surface'}}),Layer({source:ref('cloth')})]});
