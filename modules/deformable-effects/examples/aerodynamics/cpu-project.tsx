/** @jsxImportSource @frameweave/engine */
import {Composition,Stage} from '@frameweave/engine';
export default <Composition width={640} height={360} fps={24} durationInFrames={24} seed={91}><Stage id="aero" entry="./numeric.ts" outputs={{state:'json',metrics:'json'}}/></Composition>;
