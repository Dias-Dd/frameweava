import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {paBorrowed} from '../pa/stage.ts';
export {paBorrowed};
export default <Composition width={17} height={13} fps={{num:30000,den:1001}} durationInFrames={240} background="transparent"><Stage id="pa" factory={paBorrowed}/><Layer source={ref('pa')}/></Composition>;
