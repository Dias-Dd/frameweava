/** @jsxImportSource @frameweave/engine */
import {Composition,Stage,Layer,ref} from '@frameweave/engine';
export default <Composition width={640} height={360} fps={24} durationInFrames={120} seed={73} background="#061020"><Stage id="compute" entry="./scene.ts" seek="stateless" outputs={{surface:'surface',metrics:'json'}}/><Layer source={ref('compute')}/></Composition>;
