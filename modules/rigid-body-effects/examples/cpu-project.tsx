/** @jsxImportSource @frameweave/engine */
import {Composition,Stage} from '@frameweave/engine';
export default <Composition width={32} height={32} fps={24} durationInFrames={73} seed={51}>
  <Stage id="numeric" entry="./numeric.ts" seek="fixed-step" outputs={{world:'json',metrics:'json'}}/>
</Composition>;
