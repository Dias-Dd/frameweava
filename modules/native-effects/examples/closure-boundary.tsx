import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {closureStage} from '../closure-filters/stage.ts';
export {closureStage};
export default <Composition width={1} height={1} fps={24} durationInFrames={240} background="transparent"><Stage id="closure" factory={closureStage}/><Layer source={ref('closure')}/></Composition>;
