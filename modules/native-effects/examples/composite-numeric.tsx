import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {compositeStage} from '../composite/stage.ts';
export {compositeStage};
export default <Composition width={17} height={13} fps={24} durationInFrames={240} background="transparent"><Stage id="composite" factory={compositeStage}/><Layer source={ref('composite')}/></Composition>;
