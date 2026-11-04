import {video,clip,sequence,editingStage,editComposition,audioSource,audioClip,audioSequence,audioAt} from '../index.ts';
import {keyframes} from '../../../src/core/animation.ts';
const footage=video('footage','./motion.mp4',{width:320,height:180});
export const picture=editingStage({fps:24,tracks:[sequence(clip(footage,{duration:24}))]});
// Named source factories are reused by ordinary Audio Stages, never by a private mixer.
export const sound=audioSource('sound','./sound.wav',{sampleRate:48000,layout:'mono',sampleCount:48000});
export const music=audioSource('music','./music.wav',{sampleRate:48000,layout:'stereo',sampleCount:48000});
export default editComposition({id:'audio-edit',width:640,height:360,factory:picture,audio:[
 audioSequence(audioClip(sound,{duration:12,pan:-.5,fadeIn:2,fadeOut:2}),audioClip(sound,{from:12,duration:12,pan:.5,fadeIn:2,fadeOut:2})),
 [audioAt(0,audioClip(music,{duration:24,gain:keyframes([{frame:0,value:.15},{frame:23,value:.3}]),fadeIn:3,fadeOut:3}))]
]});
