import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {stylizeScene} from '../stylize/stage.ts';
export {stylizeScene};
export default <Composition width={320} height={180} fps={24} durationInFrames={240} background="transparent"><Stage id="stylize" factory={stylizeScene}/><Layer source={ref('stylize')}/></Composition>;
