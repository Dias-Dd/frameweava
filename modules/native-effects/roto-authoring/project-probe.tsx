import {Composition,Stage,Layer,Resource,ref} from '@frameweave/engine';
import {neuralRotoStage} from './neural-stage.ts';
export {neuralRotoStage};
export default <Composition width={614} height={410} fps={{num:30000,den:1001}} durationInFrames={240} background="transparent"><Resource id="roto-encoder" src="./model/encoder.onnx" kind="file"/><Resource id="roto-decoder" src="./model/decoder.onnx" kind="file"/><Resource id="photo" src="./model/corgi.jpg" kind="image"/><Stage id="roto-authoring" factory={neuralRotoStage} props={{capture:true,probe:true}}/><Layer source={ref('roto-authoring')}/></Composition>;
