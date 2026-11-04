import {Composition,Stage,Layer,ref,keyframes} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {windFlag} from 'spatial-creation-candidate';
export const flag=defineNativeStage(()=>windFlag({
 wind:[.4,.1,keyframes([{frame:0,value:1.2},{frame:23,value:2.2}])],
 ink:[.95,.22,.055],
}));
export default Composition({id:'wind-flag',width:640,height:360,fps:24,durationInFrames:24,
 background:'#101927',children:[Stage({id:'flag',factory:flag,outputs:{surface:'surface'}}),Layer({source:ref('flag')})]});
