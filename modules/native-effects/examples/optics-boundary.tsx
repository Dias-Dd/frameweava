import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {opticalStage} from '../optics/stage.ts';
export {opticalStage};
export default <Composition width={1} height={1} fps={24} durationInFrames={240} background="transparent"><Stage id="optics" factory={opticalStage}/><Layer source={ref('optics')}/></Composition>;
