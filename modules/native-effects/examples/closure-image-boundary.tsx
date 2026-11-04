import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {closureImageStage} from '../closure-images/stage.ts';
export {closureImageStage};
export default <Composition width={1} height={1} fps={24} durationInFrames={240} background="transparent"><Stage id="closure-image" factory={closureImageStage}/><Layer source={ref('closure-image')}/></Composition>;
