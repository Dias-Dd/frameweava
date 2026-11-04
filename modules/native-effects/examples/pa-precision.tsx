import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {precisionStage} from '../pa/precision-stage.ts';
export {precisionStage};
export default <Composition width={51} height={13} fps={{num:30000,den:1001}} durationInFrames={240} background="transparent"><Stage id="pa" factory={precisionStage}/><Layer source={ref('pa')}/></Composition>;
