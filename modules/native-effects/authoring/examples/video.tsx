import {Composition,Stage,Layer,Resource,ref} from '@frameweave/engine';import {imageStage,videoResource,videoSequence,compose,temporalDenoise,exposure,offsetRGB,glow} from '../index.ts';
const samples=videoSequence('clip',[
 {time:{num:0,den:1},position:{frame:0}},
 {time:{num:1,den:24},position:{frame:1}},
 {time:{num:5,den:48},observed:false},
 {time:{num:3,den:24},position:{frame:2}},
],{cacheBytes:320*180*16*4});
export const finished=imageStage(compose(
 temporalDenoise(samples,{strength:.3,windowSeconds:.3,maximumGapSeconds:.1,flowOptions:{levels:1,iterations:1,radius:1}}),
 exposure(1),offsetRGB({offset:[-.15,-.15,-.15]}),glow({radius:1,intensity:.1}),
),{source:videoResource('clip',{cacheBytes:320*180*16*4})});
export default <Composition width={320} height={180} fps={24} durationInFrames={11} background="transparent"><Resource id="clip" src="./.generated-video/clip.mp4" kind="media"/><Stage id="finish" factory={finished}/><Layer source={ref('finish')}/></Composition>;
