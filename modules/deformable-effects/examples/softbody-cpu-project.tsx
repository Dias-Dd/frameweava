/** @jsxImportSource @frameweave/engine */
import {Composition,Stage} from '@frameweave/engine';
export default <Composition width={640} height={360} fps={24} durationInFrames={49} seed={51}><Stage id="numeric" entry="./softbody-numeric.ts" seek="fixed-step" outputs={{state:'json',metrics:'json'}}/></Composition>;
