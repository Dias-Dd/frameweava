import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {imageInputStage} from '../io/stage.ts';
export {imageInputStage};
export default <Composition width={17} height={13} fps={24} durationInFrames={24} background="transparent"><Stage id="input" factory={imageInputStage} props={{reference:true}}/><Layer source={ref('input')}/></Composition>;
