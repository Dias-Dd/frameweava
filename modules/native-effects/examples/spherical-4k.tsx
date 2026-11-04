import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {sphericalPerformanceStage} from '../spherical/performance-stage.ts';export {sphericalPerformanceStage};
export default <Composition width={3840} height={2160} fps={24} durationInFrames={9} background="transparent"><Stage id="spherical" factory={sphericalPerformanceStage}/><Layer source={ref('spherical')}/></Composition>;
