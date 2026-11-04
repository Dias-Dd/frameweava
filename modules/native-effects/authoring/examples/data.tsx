import {Composition,Stage,Layer,Resource,ref} from '@frameweave/engine';import {keyframes} from '../../../../src/core/animation.ts';
import {imageStage,floatImageResource,imageSequence,frameSeconds,compose,temporalDenoise,depthMap,depthOfField} from '../index.ts';
const width=160,height=90,fps={num:24,den:1};
// Explicit supplied frames. Replace these three files with matching source
// observations; this declaration never re-evaluates upstream Stages by itself.
const sequence=imageSequence([
 {time:frameSeconds(-1,fps),image:floatImageResource('previous')},
 {time:frameSeconds(0,fps),image:floatImageResource('current')},
 {time:frameSeconds(1,fps),image:floatImageResource('next')},
]);
// Ordinary JS prepares control data once. Real projects may import a JSON depth
// array instead; positive camera z is metres and exactly 0 is missing.
const depth=depthMap(Array.from({length:width*height},(_,i)=>1.5+5*(i%width)/width));
export const finished=imageStage(compose(
 temporalDenoise(sequence,{time:{num:0,den:1},flowOptions:{levels:2,iterations:2,radius:2}}),
 depthOfField(depth,{focalLengthMm:50,fStop:2.8,focusDistanceM:keyframes([{frame:0,value:2},{frame:11,value:5}])}),
),{source:floatImageResource('current')});
export default <Composition width={width} height={height} fps={fps} durationInFrames={12} background="transparent"><Resource id="previous" src="./assets/photo.f32" kind="file"/><Resource id="current" src="./assets/input.f32" kind="file"/><Resource id="next" src="./assets/photo.f32" kind="file"/><Stage id="finish" factory={finished}/><Layer source={ref('finish')}/></Composition>;
