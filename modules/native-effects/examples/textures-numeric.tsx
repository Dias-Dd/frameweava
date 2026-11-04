import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {textureStage} from '../textures/stage.ts';
export {textureStage};
export default <Composition width={17} height={13} fps={24} durationInFrames={240} background="transparent"><Stage id="textures" factory={textureStage}/><Layer source={ref('textures')}/></Composition>;
