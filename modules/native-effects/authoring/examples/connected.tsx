import {Composition,Stage,Layer,Resource,ref} from '@frameweave/engine';import {imageStage,floatImageResource,compose} from '../index.ts';import {look} from './look.ts';
export const source=imageStage(compose(),{source:floatImageResource('photo')});
export const finish=imageStage(look);
export default <Composition width={160} height={90} fps={24} durationInFrames={12} background="transparent"><Resource id="photo" src="./assets/input.f32" kind="file"/><Stage id="source" factory={source}/><Stage id="finish" factory={finish} inputs={{image:ref('source')}} inputTypes={{image:'surface'}}/><Layer source={ref('finish')}/></Composition>;
