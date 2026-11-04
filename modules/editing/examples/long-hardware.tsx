import {video,clip,sequence,editingStage,editComposition,audioSource,audioClip,audioSequence} from '../index.ts';
// prepare-long.ts creates genuine 21-minute source media beside this file.
// Three seven-minute source selections, with the last two deliberately reordered.
const fps=24,segment=7*60*fps;
const footage=video('long-picture','./long-source.mp4',{width:640,height:360,decoder:'hardware'});
export const picture=editingStage({fps,tracks:[sequence(
 clip(footage,{from:0,duration:segment}),
 clip(footage,{from:2*segment,duration:segment}),
 clip(footage,{from:segment,duration:segment}),
)]});
export const sound=audioSource('long-sound','./long-source.wav',{sampleRate:48000,layout:'stereo',sampleCount:21*60*48000});
export default editComposition({id:'long-edit',width:640,height:360,factory:picture,audio:[audioSequence(
 audioClip(sound,{from:0,duration:segment}),
 audioClip(sound,{from:2*segment,duration:segment}),
 audioClip(sound,{from:segment,duration:segment}),
)]});
