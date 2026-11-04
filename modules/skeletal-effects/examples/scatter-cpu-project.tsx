/** @jsxImportSource @frameweave/engine */
import {Composition,Stage} from '@frameweave/engine';
export default <Composition width={640} height={360} fps={24} durationInFrames={49} seed={73}><Stage id="scatter" entry="./scatter-numeric.ts" seek="stateless" outputs={{state:'json'}}/></Composition>;
