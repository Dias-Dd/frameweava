import {Composition,Stage,Layer,ref} from '@frameweave/engine';import {defineNativeStage} from '@frameweave/engine/native';
import {coupledPhysicsScene,fractureBodies,extrudeShatterFragments,shatterPattern,groundBody} from 'spatial-creation-candidate';
export const breaking=defineNativeStage(()=>{
 const wall=fractureBodies(extrudeShatterFragments(shatterPattern({pattern:'squares',size:[1.6,1.2],cell:.4}),{size:[1.6,1.2],thickness:.08}),{id:'wall',density:30,force:.6,torque:.12,fixed:[0]});
 return coupledPhysicsScene({world:{...wall,bodies:[...wall.bodies,groundBody({height:-1,size:[5,.12,3]})],gravity:[0,-3,0],substeps:4,solver:{iterations:12}},palette:[[.05,.42,.7],[.8,.24,.04],[.03,.6,.3]],roughness:.35,metalness:.15});
});
export default Composition({id:'bonded-fracture',width:640,height:360,fps:24,durationInFrames:24,background:'#071322',children:[Stage({id:'fracture',factory:breaking,outputs:{surface:'surface'}}),Layer({source:ref('fracture')})]});
