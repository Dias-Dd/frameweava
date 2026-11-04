import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {builtinStage} from '../builtin/stage.ts';
export {builtinStage};
export default <Composition width={320} height={180} fps={60} durationInFrames={240} background="transparent"><Stage id="builtin" factory={builtinStage} props={{chain:true}}/><Layer source={ref('builtin')}/></Composition>;
