/** @jsxImportSource @frameweave/engine */
import {Composition,Stage,Layer,ref,keyframes} from '@frameweave/engine';
/** Pre-integration source example. Main owns package names, release and L3 installation/export wiring. */
export default <Composition width={384} height={192} fps={12} durationInFrames={12} background="#061019">
 <Stage id="shapes" entry="./stage.ts" outputs={{surface:'surface',stats:'json'}} props={{format:'rgba32float'}}/>
 <Layer source={ref('shapes')} opacity={keyframes([{frame:0,value:.8},{frame:11,value:1}])}/>
</Composition>;
