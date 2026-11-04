import {Composition,Stage,Layer,ref} from '@frameweave/engine';import {paintStage} from '../roto-authoring/stage.ts';
export {paintStage};
export default <Composition width={19} height={13} fps={{num:30000,den:1001}} durationInFrames={240} background="transparent"><Stage id="roto-authoring" factory={paintStage} props={{reference:true}}/><Layer source={ref('roto-authoring')}/></Composition>;
