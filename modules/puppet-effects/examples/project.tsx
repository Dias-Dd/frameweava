/** @jsxImportSource @frameweave/engine */
import {Composition,Stage,Layer,ref} from '@frameweave/engine';
export default <Composition width={640} height={360} fps={24} durationInFrames={49} seed={51} background="#0b1524">
  <Stage id="paint" entry="./paint.ts" seek="stateless" outputs={{surface:'surface'}}/>
  <Stage id="puppet" entry="./puppet.ts" seek="stateless" inputs={{image:ref('paint')}} inputTypes={{image:'surface'}} outputs={{surface:'surface',metrics:'json'}}/>
  <Layer source={ref('puppet')}/>
</Composition>;
