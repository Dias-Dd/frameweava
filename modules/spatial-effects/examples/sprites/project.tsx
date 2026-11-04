/** @jsxImportSource @frameweave/engine */
import {Composition,Stage,Resource,Layer,ref} from '@frameweave/engine';
export default <Composition width={640} height={360} fps={24} durationInFrames={49} seed={51} background="#101b30">
 <Resource id="sprite" src="./atlas.png" kind="image"/>
 <Stage id="source" entry="./image.ts" seek="stateless" outputs={{surface:'surface'}}/>
 <Stage id="particles" entry="./particles.ts" seek="stateless" inputs={{image:ref('source')}} inputTypes={{image:'surface'}} outputs={{surface:'surface',metrics:'json'}}/>
 <Layer source={ref('particles')}/>
</Composition>;
