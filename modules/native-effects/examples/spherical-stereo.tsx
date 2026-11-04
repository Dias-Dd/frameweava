import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {sphericalStage} from '../spherical/stage.ts';export {sphericalStage};
export default <Composition width={18} height={5} fps={{num:30000,den:1001}} durationInFrames={9} background="transparent"><Stage id="spherical" factory={sphericalStage} props={{layout:'side-by-side'}}/><Layer source={ref('spherical')}/></Composition>;
