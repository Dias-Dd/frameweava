import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {ocioAcesStage} from '../closure-filters/ocio/aces-stage.ts';
export {ocioAcesStage};
export default <Composition width={320} height={180} fps={24} durationInFrames={240} background="transparent"><Stage id="ocio" factory={ocioAcesStage}/><Layer source={ref('ocio')}/></Composition>;
