import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {restorationStage} from '../restoration/stage.ts';
export {restorationStage};
export default <Composition width={1} height={1} fps={24} durationInFrames={240} background="transparent"><Stage id="restoration" factory={restorationStage}/><Layer source={ref('restoration')}/></Composition>;
