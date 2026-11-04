import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {colorStage} from '../color/stage.ts';
export {colorStage};
export default <Composition width={320} height={180} fps={60} durationInFrames={240} background="transparent"><Stage id="color" factory={colorStage} props={{mode:'chain'}}/><Layer source={ref('color')}/></Composition>;
