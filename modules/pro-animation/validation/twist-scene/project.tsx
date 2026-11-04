/** @jsxImportSource @frameweave/engine */
import {Composition,Stage,Layer,Resource,ref,keyframes} from '@frameweave/engine';
export default <Composition width={640} height={240} fps={12} durationInFrames={12} background="#061019">
 <Resource id="notosans" kind="font" src="../shaping-scene/fonts/notosans.ttf"/>
 <Stage id="twist" entry="./stage.ts" outputs={{surface:'surface',stats:'json'}} props={{format:'rgba32float'}}/>
 <Layer source={ref('twist')} opacity={keyframes([{frame:0,value:.8},{frame:11,value:1}])}/>
</Composition>;
