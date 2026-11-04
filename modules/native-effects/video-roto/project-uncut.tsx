import {Composition,Stage,Layer,Resource,ref} from '@frameweave/engine';
import {videoRotoStage} from './stage.ts';export {videoRotoStage};
export default <Composition width={614} height={410} fps={{num:30000,den:1001}} durationInFrames={240} background="transparent">
 <Resource id="video-roto-vision" src="./model/vision.onnx" kind="file"/><Resource id="video-roto-seed" src="./model/seed.onnx" kind="file"/><Resource id="video-roto-track" src="./model/track.onnx" kind="file"/><Resource id="photo-f32" src="./model/corgi-linear.f32" kind="file"/>
 <Stage id="video-roto" factory={videoRotoStage} props={{capture:true,segmentFrames:0}}/><Layer source={ref('video-roto')}/>
</Composition>;
