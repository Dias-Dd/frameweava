import {Composition,Stage,Layer,ref} from '@frameweave/engine';import {temporalStage} from '../temporal-restoration/stage.ts';export {temporalStage};
export default <Composition width={320} height={180} fps={24} durationInFrames={240} seed={0} background="transparent"><Stage id="temporal" factory={temporalStage} props={{scene:true}}/><Layer source={ref('temporal')}/></Composition>;
