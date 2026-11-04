/** @jsxImportSource @frameweave/engine */
import {Composition,Stage,Layer,Resource,ref,keyframes} from '@frameweave/engine';
// Explicit OFL test resources. No model/font download occurs during rendering.
export default <Composition width={640} height={240} fps={12} durationInFrames={12} background="#061019">
 <Resource id="notosans" kind="font" src="./fonts/notosans.ttf"/>
 <Resource id="notonaskharabic" kind="font" src="./fonts/notonaskharabic.ttf"/>
 <Resource id="notosansjp" kind="font" src="./fonts/notosansjp.ttf"/>
 <Stage id="shaping" entry="./stage.ts" outputs={{surface:'surface',stats:'json'}} props={{format:'rgba32float'}}/>
 <Layer source={ref('shaping')} opacity={keyframes([{frame:0,value:.8},{frame:11,value:1}])}/>
</Composition>;
