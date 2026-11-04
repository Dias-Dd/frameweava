import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {psfRestorationStage} from '../psf-restoration/stage.ts';
export {psfRestorationStage};
export default <Composition width={160} height={90} fps={24} durationInFrames={4} background="transparent"><Stage id="restoration" factory={psfRestorationStage} props={{capture:true,scene:true}}/><Layer source={ref('restoration')}/></Composition>;
