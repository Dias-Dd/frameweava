import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {builtinStage} from '../builtin/stage.ts';
export {builtinStage};
export default <Composition width={17} height={13} fps={60} durationInFrames={240} background="transparent"><Stage id="builtin" factory={builtinStage} props={{reference:true}}/><Layer source={ref('builtin')}/></Composition>;
