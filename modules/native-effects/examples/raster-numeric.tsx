import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {rasterStage} from '../raster/stage.ts';
export {rasterStage};
export default <Composition width={17} height={13} fps={30} durationInFrames={240} background="transparent"><Stage id="raster" factory={rasterStage}/><Layer source={ref('raster')}/></Composition>;
