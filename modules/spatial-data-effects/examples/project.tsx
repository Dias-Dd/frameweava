/** @jsxImportSource @frameweave/engine */
import {Composition,Stage,Layer,ref} from '@frameweave/engine';
export default <Composition width={640} height={360} fps={24} durationInFrames={49} seed={51} background="#0b1524">
  <Stage id="spatial" entry="./scene.ts" seek="stateless" props={{view:'normal'}} outputs={{surface:'surface',metrics:'json'}}/>
  <Layer source={ref('spatial')}/>
</Composition>;
