import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {invalidPublication} from '../checks.ts';
export {invalidPublication};
export default <Composition width={32} height={18} fps={60} durationInFrames={2} background="transparent"><Stage id="effects" factory={invalidPublication}/><Layer source={ref('effects')}/></Composition>;
