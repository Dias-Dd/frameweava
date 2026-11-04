import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {psfRestorationStage} from '../psf-restoration/stage.ts';
export {psfRestorationStage};
export default <Composition width={7} height={5} fps={{num:30000,den:1001}} durationInFrames={16} background="transparent"><Stage id="restoration" factory={psfRestorationStage} props={{capture:true}}/><Layer source={ref('restoration')}/></Composition>;
