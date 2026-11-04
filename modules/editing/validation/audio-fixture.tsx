import {keyframes} from '@frameweave/engine';
import {audioSource,audioClip,audioAt,audioComposition} from '../index.ts';
export const sound=audioSource('sound','./sound.wav',{sampleRate:48000,layout:'mono',sampleCount:48000});
export const music=audioSource('music','./music.wav',{sampleRate:48000,layout:'stereo',sampleCount:48000});
export default audioComposition({fps:24,duration:24,tracks:[
 [audioAt(0,audioClip(sound,{duration:10,pan:-1,fadeIn:2,fadeOut:2})),audioAt(14,audioClip(sound,{from:14,duration:10,pan:1,fadeIn:2,fadeOut:2}))],
 [audioAt(0,audioClip(music,{duration:24,gain:keyframes([{frame:0,value:.15},{frame:23,value:.3}]),fadeIn:3,fadeOut:3}))]
]});
