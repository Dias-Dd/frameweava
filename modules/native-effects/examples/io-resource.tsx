import {Composition,Stage,Layer,Resource,ref} from '@frameweave/engine';
import {imageInputStage} from '../io/stage.ts';
export {imageInputStage};
export default <Composition width={160} height={128} fps={24} durationInFrames={24} background="transparent"><Resource id="source" src="./io-assets/input.surface.json" kind="file"/><Stage id="input" factory={imageInputStage} props={{mode:'surface'}}/><Layer source={ref('input')}/></Composition>;
