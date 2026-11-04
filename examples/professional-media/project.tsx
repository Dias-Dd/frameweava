import {Composition,Stage,Layer,ref} from '@frameweave/engine';
export default <Composition width={128} height={64} fps={12} durationInFrames={6} background="transparent">
  <Stage id="source" entry="./stages.ts" exportName="source" outputs={{surface:'surface'}}/>
  <Stage id="exposure" entry="./stages.ts" exportName="exposure" inputs={{image:ref('source')}} inputTypes={{image:'surface'}} outputs={{surface:'surface'}}/>
  <Layer id="result" source={ref('exposure')}/>
</Composition>;
