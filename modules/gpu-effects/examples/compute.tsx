import {Composition,Stage} from '@frameweave/engine';

// GPU-only, deterministic feedback simulation; preview/export remains the
// normal Frameweave professional Surface pipeline. No new time evaluator.
export default <Composition width={640} height={360} fps={64} durationInFrames={128}>
 <Stage id="particles" entry="./compute-stage.ts" outputs={{surface:'surface',stats:'json'}} props={{kind:'particles'}}/>
</Composition>;
