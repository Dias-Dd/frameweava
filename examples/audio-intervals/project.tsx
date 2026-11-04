import {Composition,Stage,Layer,Resource,ref} from '@frameweave/engine';
import {defineAudioStage} from '@frameweave/engine/audio';

/** Extract one NTSC second starting at source second 60. prepare.ts generates
 * a 90-second WAV; only each requested PCM interval enters the Audio Stage. */
export const music=defineAudioStage({sampleRate:48000,layout:'stereo',durationSamples:48048},init=>({
  async evaluateInterval(request){
    const offset=60*48000;
    const block=await init.audio.read({
      resourceId:'music',stream:0,
      interval:{...request.local,start:offset+request.local.start,endExclusive:offset+request.local.endExclusive},
      layout:'stereo',conversion:{sampleRate:'reject',layout:'reject'},
    });
    // Source sample coordinates and this Stage's local coordinates differ.
    return {audio:{...block,startSample:request.local.start}};
  },
}));

export default <Composition width={1} height={1} fps={{num:30000,den:1001}} durationInFrames={30}>
  <Resource id="music" src="./source.wav" kind="file" />
  <Stage id="music" factory={music} />
  <Layer source={ref('music','audio')} gain={0.7} end={30} />
</Composition>;
