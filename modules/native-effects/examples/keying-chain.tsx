import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {keyingScene} from '../keying/stage.ts';
export {keyingScene};
export default <Composition width={320} height={180} fps={24} durationInFrames={240} background="transparent"><Stage id="keying" factory={keyingScene}/><Layer source={ref('keying')}/></Composition>;
