import {video,clip,sequence,editingStage,editComposition} from '../index.ts';
import {captionTracks} from './captions-formal-prepared.ts';
const footage=video('footage','./footage.mp4',{width:320,height:180});
export const edited=editingStage({fps:24,tracks:[sequence(clip(footage,{duration:24})),...captionTracks]});
export default editComposition({id:'formal-caption-edit',width:640,height:360,factory:edited});
