import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {sphericalStage} from '../spherical/stage.ts';export {sphericalStage};
export default <Composition width={17} height={9} fps={{num:30000,den:1001}} durationInFrames={9} background="transparent"><Stage id="spherical" factory={sphericalStage}/><Layer source={ref('spherical')}/></Composition>;
