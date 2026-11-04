import {Composition,Stage,Layer,ref} from '@frameweave/engine';import {stabilizationBorderStage} from '../stabilization/border-stage.ts';export {stabilizationBorderStage};
export default <Composition width={1} height={1} fps={24} durationInFrames={3} background="transparent"><Stage id="borders" factory={stabilizationBorderStage}/><Layer source={ref('borders')}/></Composition>;
