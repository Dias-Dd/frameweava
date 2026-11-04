import {Composition,Stage,Layer,Resource,ref} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {createSuperResolution} from './effect.ts';
export const enhance=defineNativeStage(async init=>{const model=await createSuperResolution(init.gpu);return {renderAt(context){return model.render(context.frame,true);},dispose(){return model.dispose();}};});
export default <Composition width={672} height={672} fps={24} durationInFrames={6} background="transparent"><Resource id="super-resolution" src="./model/super-resolution-10.onnx" kind="file"/><Stage id="enhance" factory={enhance}/><Layer source={ref('enhance')}/></Composition>;
