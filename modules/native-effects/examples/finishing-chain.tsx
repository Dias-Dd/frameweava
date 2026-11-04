import {Composition,Stage,Layer,ref} from '@frameweave/engine';import {finishingStage} from '../finishing/stage.ts';export {finishingStage};
export default <Composition width={320} height={180} fps={24} durationInFrames={240} seed={0} background="transparent"><Stage id="finishing" factory={finishingStage} props={{scene:true}}/><Layer source={ref('finishing')}/></Composition>;
