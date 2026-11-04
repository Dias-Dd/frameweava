import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {geometryStage} from '../geometry/stage.ts';
export {geometryStage};
export default <Composition width={320} height={180} fps={24} durationInFrames={240} background="transparent"><Stage id="geometry" factory={geometryStage} props={{chain:true}}/><Layer source={ref('geometry')}/></Composition>;
