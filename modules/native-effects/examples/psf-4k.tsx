import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {psfRestorationStage} from '../psf-restoration/stage.ts';export {psfRestorationStage};
export default <Composition width={3840} height={2160} fps={24} durationInFrames={24} background="transparent"><Stage id="restoration" factory={psfRestorationStage} props={{scene:true,performance:true,iterations:4}}/><Layer source={ref('restoration')}/></Composition>;
