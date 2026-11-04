import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {rasterScene} from '../raster/stage.ts';
export {rasterScene};
export default <Composition width={1920} height={1080} fps={{num:30000,den:1001}} durationInFrames={240} background="transparent"><Stage id="raster" factory={rasterScene}/><Layer source={ref('raster')}/></Composition>;
