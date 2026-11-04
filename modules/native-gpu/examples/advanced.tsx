import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {recipe} from '../../../prototypes/performance-advanced-effects/recipe.ts';
/** Same frozen 12-effect workload /1; no reduced raymarch quality. */
export const advanced=defineNativeStage(init=>({
 async renderAt(context){return (await recipe(init.gpu,context,init.width,init.height)).image;},
}));
export default <Composition id="native-advanced-1" width={1920} height={1080} fps={60} durationInFrames={240} background="transparent">
 <Stage id="advanced" factory={advanced}/><Layer source={ref('advanced')}/>
</Composition>;
