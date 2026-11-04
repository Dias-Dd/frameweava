/** @jsxImportSource @frameweave/engine */
import {Composition,Stage,Layer,Resource,ref} from '@frameweave/engine';
export default <Composition width={640} height={360} fps={24} durationInFrames={49} seed={51} background="#101b30">
  <Resource id="sprite" src="./sprite.png" kind="image"/>
  <Stage id="image" entry="./image.ts" seek="stateless" outputs={{surface:'surface'}}/>
  <Stage id="puppet" entry="./numeric.ts" seek="stateless" inputs={{image:ref('image')}} inputTypes={{image:'surface'}} outputs={{metrics:'json'}}/>
</Composition>;
