import {Composition,Stage,Layer,ref} from '@frameweave/engine';import {sphericalStage} from '../spherical/stage.ts';export {sphericalStage};
export default <Composition width={17} height={9} fps={{num:30000,den:1001}} durationInFrames={16} background="transparent"><Stage id="spherical" factory={sphericalStage} props={{suite:true,segments:true}}/><Layer source={ref('spherical')}/></Composition>;
