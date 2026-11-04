import {Composition,Stage,Layer,Resource,ref} from '@frameweave/engine';import {boundary} from '../boundary-stage.ts';export {boundary};
export default <Composition width={160} height={90} fps={24} durationInFrames={12} background="transparent"><Resource id="photo" src="./assets/input.surface.json" kind="file"/><Stage id="finish" factory={boundary}/><Layer source={ref('finish')}/></Composition>;
