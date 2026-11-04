import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {textureScene} from '../textures/stage.ts';
export {textureScene};
export default <Composition width={320} height={180} fps={24} durationInFrames={240} background="transparent"><Stage id="textures" factory={textureScene}/><Layer source={ref('textures')}/></Composition>;
