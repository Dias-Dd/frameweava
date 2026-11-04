import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {keyingStage} from '../keying/stage.ts';
export {keyingStage};
export default <Composition width={17} height={13} fps={24} durationInFrames={240} background="transparent"><Stage id="keying" factory={keyingStage} props={{reference:true}}/><Layer source={ref('keying')}/></Composition>;
