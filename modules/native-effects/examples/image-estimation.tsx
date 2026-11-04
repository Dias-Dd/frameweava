import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {estimationStage} from '../image-estimation/stage.ts';
export {estimationStage};
export default <Composition width={16} height={12} fps={{num:30000,den:1001}} durationInFrames={240} background="transparent"><Stage id="image-estimation" factory={estimationStage}/><Layer source={ref('image-estimation')}/></Composition>;
