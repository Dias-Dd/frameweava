import {keyframes,type FrameContext} from '@frameweave/engine';
import type {LightningSampleOptions} from 'skeletal-effects';
export const recipe={id:'electric.arc',seed:83,subdivisions:5,branchGenerations:2,branchesPerBolt:2,branchLength:.45,branchAngle:.9,branchRadius:.9,roughness:.58,tipScale:.25,radialSegments:8} as const;
export function lightningFrame(context:FrameContext):LightningSampleOptions {
  // Ordinary TS controls the anchors; Core Signal controls width. No second clock.
  return {context,start:[-2.7,.8,0],end:[2.4,2.1+.35*Math.sin(context.time*2),.3*Math.sin(context.time)],radius:keyframes([{frame:0,value:.04},{frame:24,value:.06},{frame:48,value:.04}]),amplitude:.105,phase:context.time*4};
}
