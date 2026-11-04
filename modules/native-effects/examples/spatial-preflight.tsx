import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {spatialPreflight} from '../spatial/preflight-stage.ts';
export {spatialPreflight};
export default <Composition width={64} height={32} fps={24} durationInFrames={240} background="transparent"><Stage id="spatial" factory={spatialPreflight} props={{failFrame:0}}/><Layer source={ref('spatial')}/></Composition>;
