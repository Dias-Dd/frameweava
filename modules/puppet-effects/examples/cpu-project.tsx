/** @jsxImportSource @frameweave/engine */
import {Composition,Stage} from '@frameweave/engine';
export default <Composition width={32} height={32} fps={24} durationInFrames={49}>
  <Stage id="numeric" entry="./numeric.ts" seek="stateless" outputs={{pose:'json'}}/>
</Composition>;
