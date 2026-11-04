import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {builtinBorrowed} from '../builtin/stage.ts';
export {builtinBorrowed};
export default <Composition width={17} height={13} fps={60} durationInFrames={240} background="transparent"><Stage id="builtin" factory={builtinBorrowed} props={{chain:true,reference:true}}/><Layer source={ref('builtin')}/></Composition>;
