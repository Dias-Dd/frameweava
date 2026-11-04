import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {colorStage} from '../color/stage.ts';
export {colorStage};
export default <Composition width={17} height={13} fps={60} durationInFrames={240} background="transparent"><Stage id="color" factory={colorStage} props={{reference:true}}/><Layer source={ref('color')}/></Composition>;
