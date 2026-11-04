import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {compositeScene} from '../composite/stage.ts';
export {compositeScene};
export default <Composition width={320} height={180} fps={24} durationInFrames={240} background="transparent"><Stage id="composite" factory={compositeScene}/><Layer source={ref('composite')}/></Composition>;
