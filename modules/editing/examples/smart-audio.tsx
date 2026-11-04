import {audioSource,audioFromRanges,audioSequence,audioComposition} from '../index.ts';
import {selectedRanges} from './smart-prepared.ts';
export const sound=audioSource('sound','./auto-sound.wav',{sampleRate:48000,layout:'mono',sampleCount:48000});
export default audioComposition({fps:24,tracks:[audioSequence(...audioFromRanges(sound,selectedRanges,{fps:24,rounding:'cover'}))]});
