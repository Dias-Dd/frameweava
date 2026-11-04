import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {restorationScene} from '../restoration/stage.ts';
export {restorationScene};
export default <Composition width={320} height={180} fps={24} durationInFrames={240} background="transparent"><Stage id="restoration" factory={restorationScene}/><Layer source={ref('restoration')}/></Composition>;
