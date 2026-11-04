/** @jsxImportSource @frameweave/engine */
import {Composition,Stage,Layer,ref,content} from '@frameweave/engine';
import {defineAudioStage,generateAudio} from '@frameweave/engine/audio';
export const tone=defineAudioStage({sampleRate:48000,layout:'mono',durationSamples:12000},()=>({
  evaluateInterval(r){return {audio:generateAudio(r.local,'mono',({time})=>.2*Math.sin(2*Math.PI*440*time))};},
}));
export default <Composition width={1} height={1} fps={12}>
  <Stage id="tone" factory={tone}/>
  <Layer source={content.audio(ref('tone','audio'),{sampleRate:48000,durationSamples:12000})} start={3}/>
</Composition>;
