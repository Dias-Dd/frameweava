import {Composition,Stage,Layer,Resource,ref} from '@frameweave/engine';import {imageStage,floatImageResource} from '../index.ts';import {look} from './look.ts';
export const finished=imageStage(look,{source:floatImageResource('photo')});
export default <Composition width={160} height={90} fps={24} durationInFrames={12} background="transparent"><Resource id="photo" src="./assets/input.f32" kind="file"/><Stage id="finish" factory={finished}/><Layer source={ref('finish')}/></Composition>;
