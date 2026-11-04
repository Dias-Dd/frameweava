import {Composition,Stage,Layer,Resource,ref} from '@frameweave/engine';import {families} from '../family-stage.ts';export {families};
export default <Composition width={17} height={13} fps={24} durationInFrames={512} background="transparent"><Resource id="auxiliary" src="./assets/auxiliary.f32" kind="file"/><Stage id="families" factory={families}/><Layer source={ref('families')}/></Composition>;
