/** @jsxImportSource @frameweave/engine */
import {Composition,Stage,Layer,ref} from '@frameweave/engine';
export default <Composition width={640} height={360} fps={24} durationInFrames={49} seed={73} background="#081020"><Stage id="organic" entry="./isosurface-scene.ts" seek="stateless" outputs={{surface:'surface',state:'json',metrics:'json'}}/><Layer source={ref('organic')}/></Composition>;
