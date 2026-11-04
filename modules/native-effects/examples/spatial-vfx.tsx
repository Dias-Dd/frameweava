import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {nativeVfxChecks} from '../spatial/vfx-stage.ts';
export {nativeVfxChecks};
export default <Composition width={128} height={72} fps={24} durationInFrames={240} seed={91} background="transparent"><Stage id="spatial" factory={nativeVfxChecks} rate={0}/><Layer source={ref('spatial')}/></Composition>;
