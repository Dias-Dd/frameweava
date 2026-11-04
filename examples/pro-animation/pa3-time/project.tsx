/** @jsxImportSource @frameweave/engine */
import {Composition,Stage,Layer,ref,keyframes} from '@frameweave/engine';
// Pre-integration editable source example; Main owns public package wiring.
export default <Composition width={320} height={160} fps={12} durationInFrames={12} background="#07121b">
 <Stage id="timecontrols" entry="./stage.ts" outputs={{surface:'surface',stats:'json'}} props={{format:'rgba32float'}}/>
 <Layer source={ref('timecontrols')} opacity={keyframes([{frame:0,value:.85},{frame:11,value:1}])}/>
</Composition>;
