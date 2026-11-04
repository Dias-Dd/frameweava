import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {combined} from '../stages.ts';
export {combined};
// Source-backed editable example. Main owns the future immutable Native R1 ID.
export default <Composition width={1920} height={1080} fps={60} durationInFrames={240} background="transparent"><Stage id="effects" factory={combined}/><Layer source={ref('effects')}/></Composition>;
