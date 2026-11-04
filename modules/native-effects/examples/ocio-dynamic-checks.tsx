import {Composition,Stage,Layer,ref} from '@frameweave/engine';import {ocioDynamicStage} from '../closure-filters/ocio/dynamic-stage.ts';export {ocioDynamicStage};
export default <Composition width={16} height={8} fps={24} durationInFrames={12} background="transparent"><Stage id="ocio" factory={ocioDynamicStage} props={{checks:true}}/><Layer source={ref('ocio')}/></Composition>;
