import {keyframes,type FrameContext} from '@frameweave/engine';
import type {MetaballSampleOptions} from 'skeletal-effects';
export const recipe={id:'organic.surface',cells:[28,28,28] as [number,number,number],bounds:{min:[-1.6,-1.3,-1.3] as [number,number,number],max:[1.6,1.3,1.3] as [number,number,number]},triangleCapacity:8000} as const;
export function metaballFrame(context:FrameContext):MetaballSampleOptions {
  const t=context.time,d=.75-.32*Math.sin(t*Math.PI/2);
  return {context,level:.125,balls:[{center:[-d,.05*Math.sin(t*3),0],radius:.95},{center:[d,0,0],radius:.95},{center:[.18*Math.sin(t*2),.52*Math.cos(t*1.4),.4*Math.sin(t*1.7)],radius:keyframes([{frame:0,value:.6},{frame:24,value:.8},{frame:48,value:.6}]),strength:.8}]};
}
