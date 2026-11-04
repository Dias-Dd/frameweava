import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {createRayExample} from './effect.ts';
export const rayStage=defineNativeStage(async init=>{const effect=await createRayExample(init.gpu,init.width,init.height);return {renderAt(c){return effect.render(c.frame);},dispose(){return effect.dispose();}};});
export default <Composition width={160} height={90} fps={24} durationInFrames={8} background="transparent"><Stage id="rays" factory={rayStage}/><Layer source={ref('rays')}/></Composition>;
