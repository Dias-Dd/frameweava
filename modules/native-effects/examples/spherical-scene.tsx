import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {sphericalPerformanceStage} from '../spherical/performance-stage.ts';export {sphericalPerformanceStage};
export default <Composition width={160} height={80} fps={24} durationInFrames={9} background="transparent"><Stage id="spherical" factory={sphericalPerformanceStage} props={{capture:true}}/><Layer source={ref('spherical')}/></Composition>;
