import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import picture from './resident-preview-stage.ts';
export {picture};
// Explicit SDR preview projection, not the professional delivery project.
export default <Composition width={1920} height={1080} fps={24} durationInFrames={120} background="transparent">
 <Stage id="image" factory={picture} outputs={{surface:'surface',stats:'json'}}/>
 <Layer source={ref('image')}/>
</Composition>;
