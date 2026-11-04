import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {opticalScene} from '../optics/stage.ts';
export {opticalScene};
export default <Composition width={320} height={180} fps={24} durationInFrames={240} background="transparent"><Stage id="optics" factory={opticalScene}/><Layer source={ref('optics')}/></Composition>;
