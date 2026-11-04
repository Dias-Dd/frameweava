import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import picture from './resident-accurate-stage.ts';
export {picture};
export default <Composition width={1920} height={1080} fps={24} durationInFrames={120} background="transparent">
 <Stage id="image" factory={picture} outputs={{surface:'surface',stats:'json'}}/>
 <Layer source={ref('image')}/>
</Composition>;
