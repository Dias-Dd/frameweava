import {audioSource,audioClip,audioSequence,audioComposition} from '../index.ts';
export const sound=audioSource('sound','./sound.wav',{sampleRate:48000,layout:'mono',sampleCount:48000});
export default audioComposition({fps:24,tracks:[audioSequence(audioClip(sound,{duration:24,fadeIn:3,fadeOut:3}))]});
