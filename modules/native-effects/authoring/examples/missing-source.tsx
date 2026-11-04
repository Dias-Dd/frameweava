import {Composition,Stage,Layer,ref} from '@frameweave/engine';import {imageStage,exposure} from '../index.ts';
export const finished=imageStage(exposure());
export default <Composition width={17} height={9} fps={24} durationInFrames={2}><Stage id="finish" factory={finished}/><Layer source={ref('finish')}/></Composition>;
