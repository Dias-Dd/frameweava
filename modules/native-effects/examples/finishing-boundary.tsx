import {Composition,Stage,Layer,ref} from '@frameweave/engine';import {finishingStage} from '../finishing/stage.ts';export {finishingStage};
export default <Composition width={1} height={1} fps={{num:30000,den:1001}} durationInFrames={240} seed={0} background="transparent"><Stage id="finishing" factory={finishingStage}/><Layer source={ref('finishing')}/></Composition>;
