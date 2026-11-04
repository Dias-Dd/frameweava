import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {colorBorrowedStage} from '../color/stage.ts';
export {colorBorrowedStage};
export default <Composition width={17} height={13} fps={60} durationInFrames={240} background="transparent"><Stage id="color" factory={colorBorrowedStage} props={{mode:'chain',reference:true}}/><Layer source={ref('color')}/></Composition>;
