import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {ocioDynamicStage} from '../closure-filters/ocio/dynamic-stage.ts';
export {ocioDynamicStage};
export default <Composition width={160} height={90} fps={24} durationInFrames={12} background="transparent"><Stage id="ocio" factory={ocioDynamicStage}/><Layer source={ref('ocio')}/></Composition>;
