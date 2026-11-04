/** @jsxImportSource @frameweave/engine */
import {Composition,Stage,Layer,ref} from '@frameweave/engine';
export default <Composition width={160} height={96} fps={12} durationInFrames={9} background="#071321">
 <Stage id="art" entry="./scene.ts" exportName="default" props={{format:'rgba32float'}} outputs={{surface:'surface',metrics:'json'}}/>
 <Layer source={ref('art')}/>
</Composition>;
