import {Composition,Stage,Layer,Resource,ref,keyframes} from '@frameweave/engine';
import {imageStage,floatImageResource,compose,exposure,offsetRGB,rotoModel,refinedRoto} from '../index.ts';
import bundle from './assets/slimsam-bundle.json';
const model=rotoModel(bundle); // Local DATA identity, not installation/trust.
export const subject=imageStage(compose(exposure(1),offsetRGB({offset:[-.1,-.1,-.1]}),
 refinedRoto(model,[{id:'dog',position:[keyframes([{frame:0,value:340.5},{frame:11,value:342.5}]),250.5],label:'foreground'}],{segment:{softness:.1},refine:{radius:1,strength:.6,feather:.5}})
),{source:floatImageResource('photo')});
export default <Composition width={614} height={410} fps={24} durationInFrames={12} background="transparent">
 <Resource id="roto-encoder" src="./.generated-roto/encoder.onnx" kind="file"/>
 <Resource id="roto-decoder" src="./.generated-roto/decoder.onnx" kind="file"/>
 <Resource id="photo" src="./.generated-roto/photo.f32" kind="file"/>
 <Stage id="subject" factory={subject}/><Layer source={ref('subject')}/>
</Composition>;
