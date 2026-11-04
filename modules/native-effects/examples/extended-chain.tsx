import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {extendedChain} from '../extended-stage.ts';
export {extendedChain};
export default <Composition width={1920} height={1080} fps={60} durationInFrames={240} background="transparent"><Stage id="effects" factory={extendedChain}/><Layer source={ref('effects')}/></Composition>;
