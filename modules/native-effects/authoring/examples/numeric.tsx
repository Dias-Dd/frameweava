import {Composition,Stage,Layer,ref} from '@frameweave/engine';import {numeric} from '../numeric-stage.ts';export {numeric};
export default <Composition width={17} height={9} fps={24} durationInFrames={200} background="transparent"><Stage id="test" factory={numeric}/><Layer source={ref('test')}/></Composition>;
