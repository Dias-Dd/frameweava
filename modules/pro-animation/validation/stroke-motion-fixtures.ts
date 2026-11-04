import {createPathAuthoring} from '../src/path-authoring/index.ts';import {constantStrokeWidth,waveStrokeWidth,gradientStrokeInk,solidStrokeInk} from '../src/stroke-animation/index.ts';import {keyframes,evaluate} from '../../../src/core/animation.ts';import type {StrokeMotionOptions} from '../src/stroke-motion/index.ts';import type {NativeStrokeOptions} from '../src/stroke-animation/index.ts';
export function strokeMotionCases(config:{bend?:number;widthGain?:number}={}){
 const author=createPathAuthoring({width:420,height:240}),gain=config.widthGain??1,bend=config.bend??18,width=waveStrokeWidth(constantStrokeWidth(keyframes([{frame:0,value:gain*5},{frame:7,value:gain*12}])),{amplitude:.3,cycles:2}),ink=gradientStrokeInk([{at:0,color:[-.6,4,.5,.65]},{at:.5,color:[-.4,1,3,.8]},{at:1,color:[-.6,4,.5,.65]}]);
 const cases:{name:string;options:StrokeMotionOptions&{draw?:NativeStrokeOptions}}[]=[
 {name:'closed-area',options:{path:c=>author.at(c).areaPath({points:[[24,120,58],[60,120,25],[100,120,62-evaluate(keyframes([{frame:0,value:0},{frame:7,value:bend}]),c)],[140,120,30],[185,120,58]],curve:'basis'})!,width,spacing:1.25,roundTolerance:.02,draw:{ink}}},
 {name:'rounded-hole',options:{path:c=>author.at(c).roundedRectanglePath({center:[295,77],size:[125,85],radius:16+c.frame*1.5})!,width,spacing:1.25,roundTolerance:.02,draw:{ink}}},
 {name:'retracing-ribbon',options:{path:c=>author.at(c).linePath({points:[[28,178],[365,178],[55,178],[260,210-c.frame*1.5]]})!,width:constantStrokeWidth(keyframes([{frame:0,value:gain*10},{frame:7,value:gain*18}])),spacing:1.5,roundTolerance:.02,draw:{ink:solidStrokeInk([-.5,3.5,1,.6])}}},
 ];return cases;
}
export function strokeProbe(){const author=createPathAuthoring({width:64,height:48});return {path:author.linePath({points:[[16,24],[48,24]]})!,width:constantStrokeWidth(12),spacing:2,draw:{ink:solidStrokeInk([-.5,4,1,.5])}};}
