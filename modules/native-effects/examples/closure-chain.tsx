import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {closureScene} from '../closure-filters/stage.ts';
export {closureScene};
export default <Composition width={320} height={180} fps={24} durationInFrames={240} background="transparent"><Stage id="closure" factory={closureScene}/><Layer source={ref('closure')}/></Composition>;
