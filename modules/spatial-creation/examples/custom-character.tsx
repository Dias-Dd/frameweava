import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {validateMeshData,validateSkeletonData} from '@frameweave/engine/graphics-contracts';
import {defineNativeStage} from '@frameweave/engine/native';
import {characterWalk} from 'spatial-creation-candidate';
import file from './paper-figure.json';
// The carried JSON is editable standard Graphics data, with no external files.
// For another skeleton, supply explicit joints aliases or use raw controls/rig.
const mesh=validateMeshData(file.mesh),asset={mesh,skeleton:validateSkeletonData(file.skeleton,mesh)};
export const actor=defineNativeStage(()=>characterWalk({asset,ink:[.06,.6,.8]}));
export default Composition({id:'custom-paper-character',width:640,height:360,fps:24,durationInFrames:24,background:'#17212b',
 children:[Stage({id:'actor',factory:actor,outputs:{surface:'surface'}}),Layer({source:ref('actor')})]});
