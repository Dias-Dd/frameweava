import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {lifecycle,invalidPublication} from '../checks.ts';
export {lifecycle,invalidPublication};
export default <Composition width={32} height={18} fps={60} durationInFrames={240} background="transparent"><Stage id="effects" factory={lifecycle}/><Layer source={ref('effects')}/></Composition>;
