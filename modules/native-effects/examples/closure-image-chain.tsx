import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {closureImageScene} from '../closure-images/stage.ts';
export {closureImageScene};
export default <Composition width={320} height={180} fps={24} durationInFrames={240} background="transparent"><Stage id="closure-image" factory={closureImageScene}/><Layer source={ref('closure-image')}/></Composition>;
