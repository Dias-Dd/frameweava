import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {gradingStage} from '../grading/stage.ts';
export {gradingStage};
export default <Composition width={17} height={13} fps={24} durationInFrames={240} background="transparent"><Stage id="grading" factory={gradingStage}/><Layer source={ref('grading')}/></Composition>;
