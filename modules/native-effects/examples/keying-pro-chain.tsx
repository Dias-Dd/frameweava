import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {proKeyScene} from '../keying-pro/stage.ts';
export {proKeyScene};
export default <Composition width={320} height={180} fps={{num:30000,den:1001}} durationInFrames={240} background="transparent"><Stage id="keying-pro" factory={proKeyScene}/><Layer source={ref('keying-pro')}/></Composition>;
