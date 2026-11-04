import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {proKeyStage} from '../keying-pro/stage.ts';
export {proKeyStage};
export default <Composition width={9} height={7} fps={{num:30000,den:1001}} durationInFrames={240} background="transparent"><Stage id="keying-pro" factory={proKeyStage}/><Layer source={ref('keying-pro')}/></Composition>;
