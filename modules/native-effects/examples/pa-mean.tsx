import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {meanStage} from '../pa/precision-stage.ts';
export {meanStage};
export default <Composition width={32} height={20} fps={30} durationInFrames={1} background="transparent"><Stage id="pa" factory={meanStage}/><Layer source={ref('pa')}/></Composition>;
