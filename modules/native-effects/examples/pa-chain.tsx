import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {paScene} from '../pa/stage.ts';
export {paScene};
export default <Composition width={1920} height={1080} fps={{num:30000,den:1001}} durationInFrames={240} background="transparent"><Stage id="pa" factory={paScene}/><Layer source={ref('pa')}/></Composition>;
