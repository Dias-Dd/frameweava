import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {spatialMath} from '../spatial/math-stage.ts';
export {spatialMath};
export default <Composition width={32} height={1} fps={24} durationInFrames={4} background="transparent"><Stage id="spatial" factory={spatialMath} rate={0} props={{mode:'noise'}}/><Layer source={ref('spatial')}/></Composition>;
