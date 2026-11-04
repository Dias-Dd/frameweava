import {Composition,Stage,Layer,ref} from '@frameweave/engine';import {stabilizationStage} from '../stabilization/stage.ts';export {stabilizationStage};
export default <Composition width={320} height={180} fps={24} durationInFrames={7} background="transparent"><Stage id="stabilization" factory={stabilizationStage} props={{scene:true}}/><Layer source={ref('stabilization')}/></Composition>;
