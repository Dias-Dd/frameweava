import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {ocioDisplayStage} from '../closure-images/display-stage.ts';
export {ocioDisplayStage};
// Select "ocio/display" with display-output.ts for final display media.
export default <Composition width={320} height={180} fps={24} durationInFrames={240} background="transparent"><Stage id="ocio" factory={ocioDisplayStage}/><Layer source={ref('ocio')}/></Composition>;
