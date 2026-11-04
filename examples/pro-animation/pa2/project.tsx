/** @jsxImportSource @frameweave/engine */
import {Composition,Stage,Layer,ref,keyframes} from '@frameweave/engine';
/** Four editable authored scenes; all pixels use the same existing linear Surface/Layer compositor. */
export default <Composition width={320} height={192} fps={12} durationInFrames={9} background="#071321">
 <Stage id="path" width={160} height={96} entry="./path/scene.ts" exportName="default" props={{format:'rgba32float'}} outputs={{surface:'surface',metrics:'json'}}/>
 <Stage id="text" width={160} height={96} entry="./text/scene.ts" exportName="default" props={{format:'rgba32float'}} outputs={{surface:'surface',metrics:'json'}}/>
 <Stage id="field" width={160} height={96} entry="./field/scene.ts" exportName="default" props={{format:'rgba32float'}} outputs={{surface:'surface',metrics:'json'}}/>
 <Stage id="particles" width={160} height={96} entry="./particles/scene.ts" exportName="default" props={{format:'rgba32float'}} outputs={{surface:'surface',metrics:'json'}}/>
 <Layer source={ref('path')} opacity={keyframes([{frame:0,value:.75},{frame:8,value:1}])}/>
 <Layer source={ref('text')} x={160}/>
 <Layer source={ref('field')} y={96}/>
 <Layer source={ref('particles')} x={160} y={96} opacity={keyframes([{frame:0,value:.75},{frame:8,value:1}])}/>
</Composition>;
