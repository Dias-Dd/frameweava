import type {FrameContext} from '../../../../src/core/types.ts';
import {keyframes} from '../../../../src/core/animation.ts';
import {gradientStrokeInk,repeatStrokeInk,mixStrokeInks,reverseStrokeInk,type NativeStrokeOptions} from '../../src/stroke-animation/index.ts';
const alpha=keyframes([{frame:0,value:.35},{frame:24,value:.85},{frame:47,value:.5}]);
const base=gradientStrokeInk([{at:0,color:[-.2,3,6,alpha]},{at:.4,color:[3,-.15,.5,alpha]},{at:1,color:[.3,4,2,alpha]}]);
export function strokeOptions(index:number,c:FrameContext):NativeStrokeOptions{return {ink:index===0?base:index===1?repeatStrokeInk(base,{cycles:2}):mixStrokeInks(base,reverseStrokeInk(base),.5+.4*Math.sin(c.time*2)),opacity:.9,anchor:[300,180],rotation:.035*Math.sin(c.time*2+index),position:[5*Math.sin(c.time*3+index),3*Math.cos(c.time*2+index)],format:'rgba32float'};}
