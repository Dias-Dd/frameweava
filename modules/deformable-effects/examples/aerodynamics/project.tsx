/** @jsxImportSource @frameweave/engine */
import {Composition,Stage,Layer,ref} from '@frameweave/engine';
export default <Composition width={640} height={360} fps={24} durationInFrames={24} seed={91} background="#101b30"><Stage id="aero" entry="./scene.ts" seek="stateless" outputs={{surface:'surface',state:'json',metrics:'json'}}/><Layer source={ref('aero')}/></Composition>;
