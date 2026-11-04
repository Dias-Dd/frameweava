import {Composition,Stage,Layer,ref,keyframes} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {cloneScene} from 'spatial-creation-candidate';
// A complete kinetic sculpture; edit the object, spacing, colors or wave here.
export const shot=defineNativeStage(()=>cloneScene({
 shape:'box',geometry:{size:[.9,.9,.9]},size:.29,
 palette:[[.04,.5,.66],[.85,.23,.06],[.95,.6,.15]],
 layout:{kind:'wave',grid:[7,5,1],spacing:[.42,.42,.42],amplitude:.24,speed:3},
 rotation:[0,keyframes([{frame:0,value:-6},{frame:23,value:6}]),0],
 camera:{orbit:{azimuth:16,elevation:10,speed:4},viewHeight:2.6},
}));
export default Composition({id:'clone-shot',width:640,height:360,fps:24,durationInFrames:24,seed:37,children:[Stage({id:'shot',factory:shot,outputs:{surface:'surface'}}),Layer({source:ref('shot')})]});
