/** @jsxImportSource @frameweave/engine */
import {Composition,Stage,Layer,ref} from '@frameweave/engine';
// Explicit linear black background preserves soft coverage through the existing PNG-to-MP4 path.
// The depth Stage itself still exports a transparent PM floating matte.
// 120 authored frames allow 100 -> 0 -> 100 seeks. Export only 0..23 for a 1s clip.
export default <Composition width={640} height={360} fps={24} durationInFrames={120} seed={91} background="#000000">
  <Stage id="ink" entry="./depth-matte-ink.ts" seek="stateless" outputs={{surface:'surface'}}/>
  <Stage id="spatial" entry="./depth-matte-stage.ts" seek="stateless" outputs={{surface:'surface',metrics:'json'}}/>
  <Layer source={ref('ink')} mask={ref('spatial')}/>
</Composition>;
