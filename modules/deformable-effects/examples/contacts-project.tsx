/** @jsxImportSource @frameweave/engine */
import {Composition,Stage,Layer,ref} from '@frameweave/engine';
export default <Composition width={640} height={360} fps={24} durationInFrames={49} seed={51} background="#0b1524"><Stage id="deform" entry="./contacts-scene.ts" seek="fixed-step" outputs={{surface:'surface',state:'json',metrics:'json'}}/><Layer source={ref('deform')}/></Composition>;
