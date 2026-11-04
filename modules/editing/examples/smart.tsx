import {video,sequence,editingStage,editComposition,clipsFromRanges,audioSource,audioSequence,audioFromRanges} from '../index.ts';
import {selectedRanges} from './smart-prepared.ts';
const source=video('source','./auto-source.mov',{width:320,height:180});
// Cover complete selected sound, including subframe edges, with the same explicit frame rounding on A/V.
export const picture=editingStage({fps:24,tracks:[sequence(...clipsFromRanges(source,selectedRanges,{fps:24,rounding:'cover'}))]});
export const sound=audioSource('sound','./auto-sound.wav',{sampleRate:48000,layout:'mono',sampleCount:48000});
export default editComposition({id:'smart-edit',width:640,height:360,factory:picture,audio:[audioSequence(...audioFromRanges(sound,selectedRanges,{fps:24,rounding:'cover'}))]});
