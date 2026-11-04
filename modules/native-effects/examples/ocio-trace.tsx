import {Composition,Stage,Layer,ref} from '@frameweave/engine';import {ocioTraceStage} from '../closure-filters/ocio/trace-stage.ts';export {ocioTraceStage};
export default <Composition width={1} height={1} fps={24} durationInFrames={1}><Stage id="trace" factory={ocioTraceStage}/><Layer source={ref('trace')}/></Composition>;
