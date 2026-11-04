import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {stylizeStage} from '../stylize/stage.ts';
export {stylizeStage};
export default <Composition width={17} height={13} fps={24} durationInFrames={240} background="transparent"><Stage id="stylize" factory={stylizeStage}/><Layer source={ref('stylize')}/></Composition>;
