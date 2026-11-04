/** @jsxImportSource @frameweave/engine */
import {Composition,Stage,Layer,ref,keyframes} from '@frameweave/engine';
// Editable source-stage example. Install the reviewed private data carrier using the checkpoint harness.
// Main owns the future pro-animation public binding/manifest/version integration.
export default <Composition width={384} height={192} fps={12} durationInFrames={12} background="#061019">
 <Stage id="pathops" entry="./stage.ts" outputs={{surface:'surface',stats:'json'}} props={{format:'rgba32float'}}/>
 <Layer source={ref('pathops')} opacity={keyframes([{frame:0,value:.8},{frame:11,value:1}])}/>
</Composition>;
