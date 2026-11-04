import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {finalKeyStage} from '../closure-images/final-key-stage.ts';
export {finalKeyStage};
export default <Composition width={9} height={7} fps={{num:30000,den:1001}} durationInFrames={240} background="transparent"><Stage id="keying-pro" factory={finalKeyStage}/><Layer source={ref('keying-pro')}/></Composition>;
