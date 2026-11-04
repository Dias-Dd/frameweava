import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {geometryStage} from '../geometry/stage.ts';
export {geometryStage};
export default <Composition width={17} height={13} fps={24} durationInFrames={240} background="transparent"><Stage id="geometry" factory={geometryStage} props={{reference:true}}/><Layer source={ref('geometry')}/></Composition>;
