import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {sphericalProjectionStage} from '../spherical/projection-stage.ts';export {sphericalProjectionStage};
export default <Composition width={17} height={9} fps={24} durationInFrames={24} background="transparent"><Stage id="spherical" factory={sphericalProjectionStage}/><Layer source={ref('spherical')}/></Composition>;
