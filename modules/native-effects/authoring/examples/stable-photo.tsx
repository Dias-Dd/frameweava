import {Composition,Stage,Layer,Resource,ref} from '@frameweave/engine';import {imageStage,floatImageResource,compose,exposure,glow,vignette} from '../index.ts';
export const finished=imageStage(compose(exposure(.3),glow({radius:3,intensity:.2}),vignette()),{source:floatImageResource('photo')});
export default <Composition width={160} height={90} fps={24} durationInFrames={12} background="transparent"><Resource id="photo" src="./assets/photo.f32" kind="file"/><Stage id="finish" factory={finished}/><Layer source={ref('finish')}/></Composition>;
