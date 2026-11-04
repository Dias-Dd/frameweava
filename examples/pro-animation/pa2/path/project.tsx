/** @jsxImportSource @frameweave/engine */
import {Composition,Stage,Layer,ref,keyframes} from '@frameweave/engine';
export default <Composition width={160} height={96} fps={12} durationInFrames={9} background="#071321">
 <Stage id="art" entry="./scene.ts" exportName="default" props={{format:'rgba32float'}} outputs={{surface:'surface',metrics:'json'}}/>
 <Layer source={ref('art')} opacity={keyframes([{frame:0,value:.75},{frame:8,value:1}])}/>
</Composition>;
