import {video,clip,sequence,editingStage,editComposition,speedClip,reverseClip,freezeClip} from '../index.ts';
const footage=video('footage','./footage.mp4',{width:320,height:180});
const shot=clip(footage,{duration:24});
// Forward at 3x, a white hold, then reverse at 3x: exactly one second at 24 fps.
export const edited=editingStage({fps:24,tracks:[sequence(
 speedClip(shot,3),freezeClip(shot,0,8),speedClip(reverseClip(shot),3)
)]});
export default editComposition({id:'time-edit',width:640,height:360,factory:edited});
