import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {gradingScene} from '../grading/stage.ts';
export {gradingScene};
export default <Composition width={320} height={180} fps={24} durationInFrames={240} background="transparent"><Stage id="grading" factory={gradingScene}/><Layer source={ref('grading')}/></Composition>;
