/** @jsxImportSource @frameweave/engine */
import {Composition,Stage,Layer,ref} from '@frameweave/engine';
// Editable source checkpoint; Main owns eventual pro-animation named-export wiring.
export default <Composition width={320} height={160} fps={12} durationInFrames={12} background="#07121b">
 <Stage id="shutterplan" entry="./stage.ts" outputs={{surface:'surface',stats:'json'}} props={{format:'rgba32float'}}/>
 <Layer source={ref('shutterplan')}/>
</Composition>;
