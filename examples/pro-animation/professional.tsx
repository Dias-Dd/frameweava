/** @jsxImportSource @frameweave/engine */
import {Composition,Stage,Layer,ref,keyframes} from '@frameweave/engine';
export default <Composition width={160} height={96} fps={12} durationInFrames={9} background="transparent">
 <Stage id="art" entry="./professional/art.ts" exportName="default" outputs={{surface:'surface'}}/>
 <Stage id="carried" entry="./professional/carry.ts" exportName="default" inputs={{image:ref('art')}} inputTypes={{image:'surface'}} outputs={{surface:'surface'}}/>
 <Stage id="vector" entry="./professional/vector.ts" exportName="default" outputs={{surface:'surface'}}/>
 <Stage id="typography" entry="./professional/text.ts" exportName="default" outputs={{surface:'surface'}}/>
 <Layer source={ref('carried')}/>
 <Layer source={ref('vector')} opacity={keyframes([{frame:0,value:.5},{frame:8,value:1}])}/>
 <Layer source={ref('typography')}/>
</Composition>;
