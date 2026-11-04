import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {spatialScene} from '../spatial/scene.ts';
export {spatialScene};
export default <Composition width={1920} height={1080} fps={{num:30000,den:1001}} durationInFrames={240} seed={91} background="transparent"><Stage id="spatial" factory={spatialScene}/><Layer source={ref('spatial')}/></Composition>;
