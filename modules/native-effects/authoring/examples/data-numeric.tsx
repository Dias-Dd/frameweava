import {Composition,Stage,Layer,ref} from '@frameweave/engine';import {dataNumeric} from '../data-stage.ts';export {dataNumeric};
export default <Composition width={17} height={13} fps={{num:30000,den:1001}} durationInFrames={240} background="transparent"><Stage id="data" factory={dataNumeric}/><Layer source={ref('data')}/></Composition>;
