import {Composition,Stage,Layer,ref} from '@frameweave/engine';import {defineNativeStage} from '@frameweave/engine/native';
import {coupledPhysicsScene,softCloth,softMaterial,cutSoftBody,clothSheet,ballBody,groundBody} from 'spatial-creation-candidate';
export const simulation=defineNativeStage(()=>coupledPhysicsScene({world:{
 substeps:4,gravity:[0,-3,0],solver:{iterations:12},
 bodies:[groundBody({height:-1.1,size:[5,.15,3]}),ballBody({id:'ball',radius:.22,position:[.1,.75,0],velocity:[0,-1,0],density:50,bounce:.1})],
 soft:[softCloth(clothSheet({segments:[7,5],size:[2,1.5],plane:'xz',center:[0,.1,0]}),{id:'net',mass:1,pinned:[0,7,40,47],radius:.015,material:softMaterial({frequency:35,bendFrequency:2})})],
 cuts:[cutSoftBody('net',12,[[0,2,-2],[0,-2,-2],[0,0,2]])],
},roughness:.4,metalness:.15}));
export default Composition({id:'coupled-cloth',width:640,height:360,fps:24,durationInFrames:24,background:'#071322',children:[Stage({id:'physics',factory:simulation,outputs:{surface:'surface'}}),Layer({source:ref('physics')})]});
