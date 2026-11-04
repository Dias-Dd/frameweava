/** @jsxImportSource @frameweave/engine */
import {Composition,Stage} from '@frameweave/engine';
export default <Composition width={640} height={360} fps={24} durationInFrames={73} seed={91}>
 <Stage id="rod" entry="./numeric.ts" seek="stateless" outputs={{state:'json',metrics:'json'}}/>
</Composition>;
