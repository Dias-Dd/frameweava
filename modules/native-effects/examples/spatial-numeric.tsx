import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {numericSpatial} from '../spatial/numeric-stage.ts';
export {numericSpatial};
// Paused local time gives the existing F64 fixtures their exact t=0; globalFrame
// chooses the case. Animated media uses a separate ordinary-rate Stage.
export default <Composition width={64} height={32} fps={24} durationInFrames={240} background="transparent"><Stage id="spatial" factory={numericSpatial} rate={0} props={{group:'mesh',seeds:[]}}/><Layer source={ref('spatial')}/></Composition>;
