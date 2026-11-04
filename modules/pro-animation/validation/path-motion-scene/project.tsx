/** @jsxImportSource @frameweave/engine */
import {Composition,Stage,Layer,ref,keyframes} from '@frameweave/engine';
export default <Composition width={640} height={240} fps={12} durationInFrames={12} background="#061019">
 <Stage id="motion" entry="./stage.ts" outputs={{surface:'surface',stats:'json'}} props={{format:'rgba32float'}}/>
 <Layer source={ref('motion')} opacity={keyframes([{frame:0,value:.8},{frame:11,value:1}])}/>
</Composition>;
