/** @jsxImportSource @frameweave/engine */
import {Composition,Stage,Layer,ref} from '@frameweave/engine';
export default <Composition width={640} height={360} fps={24} durationInFrames={49} seed={51} background="#071321">
  <Stage id="particles" entry="./scene.ts" outputs={{surface:'surface',metrics:'json'}} seek="fixed-step"/>
  <Layer source={ref('particles')}/>
</Composition>;
