import {Composition,Stage,Layer,Resource,ref} from '@frameweave/engine';
import {advancedNumeric} from '../advanced-stage.ts';
export {advancedNumeric};
export default <Composition width={17} height={13} fps={24} durationInFrames={300} background="transparent"><Resource id="auxiliary" src="./assets/auxiliary.f32" kind="file"/><Stage id="advanced" factory={advancedNumeric}/><Layer source={ref('advanced')}/></Composition>;
