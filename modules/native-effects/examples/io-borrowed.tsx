import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {borrowedImageInputStage} from '../io/stage.ts';
export {borrowedImageInputStage};
export default <Composition width={17} height={13} fps={24} durationInFrames={24} background="transparent"><Stage id="input" factory={borrowedImageInputStage} props={{reference:true}}/><Layer source={ref('input')}/></Composition>;
