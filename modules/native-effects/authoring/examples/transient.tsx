import {Composition,Stage,Layer,Resource,ref} from '@frameweave/engine';
import {imageStage,imageResource} from '../index.ts';
import {look} from './look.ts';
export const finished=imageStage(look,{source:imageResource('photo',{decode:'surface-v2'})});
export default <Composition width={160} height={90} fps={24} durationInFrames={12} background="transparent">
  <Resource id="photo" src="./assets/input.surface.json" kind="file"/>
  <Stage id="finish" factory={finished}/>
  <Layer source={ref('finish')}/>
</Composition>;
