import {Composition,Stage,Layer,Resource,ref} from '@frameweave/engine';import {neuralNumeric} from '../neural-stage.ts';export {neuralNumeric};
export default <Composition width={614} height={410} fps={24} durationInFrames={200} background="transparent">
 <Resource id="roto-encoder" src="./.generated-roto/encoder.onnx" kind="file"/>
 <Resource id="roto-decoder" src="./.generated-roto/decoder.onnx" kind="file"/>
 <Resource id="photo" src="./.generated-roto/photo.f32" kind="file"/>
 <Stage id="neural" factory={neuralNumeric}/><Layer source={ref('neural')}/>
</Composition>;
