import {Composition,Stage,Layer,Resource,ref} from '@frameweave/engine';import {imageStage,floatImageResource,compose,resize,exposure} from '../index.ts';
export const finished=imageStage(compose(resize({method:'lanczos3'}),exposure(.2)),{source:floatImageResource('photo',{width:160,height:90})});
export default <Composition width={80} height={46} fps={24} durationInFrames={12} background="transparent"><Resource id="photo" src="./assets/input.f32" kind="file"/><Stage id="finish" factory={finished}/><Layer source={ref('finish')}/></Composition>;
