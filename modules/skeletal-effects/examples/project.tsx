/** @jsxImportSource @frameweave/engine */
import {Composition,Stage,Layer,ref} from '@frameweave/engine';
export default <Composition width={640} height={360} fps={24} durationInFrames={49} seed={71} background="#0b1524"><Stage id="rig" entry="./scene.ts" seek="stateless" outputs={{surface:'surface',state:'json',metrics:'json'}}/><Layer source={ref('rig')}/></Composition>;
