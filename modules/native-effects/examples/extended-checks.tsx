import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {extendedChecks} from '../extended-stage.ts';
export {extendedChecks};
export default <Composition width={32} height={18} fps={60} durationInFrames={240} background="transparent"><Stage id="effects" factory={extendedChecks}/><Layer source={ref('effects')}/></Composition>;
