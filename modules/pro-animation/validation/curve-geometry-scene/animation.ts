import {keyframes} from '../../../../src/core/animation.ts';
import type {FrameContext} from '../../../../src/core/types.ts';
import {signalMotion2D} from '../../src/motion-control/sources.ts';
import {cubicPoint} from '../../src/geometry.ts';
import {controlPoints} from './cases.ts';
export const pointSource=signalMotion2D([keyframes([{frame:0,value:75},{frame:7,value:570}]),keyframes([{frame:0,value:250},{frame:7,value:45}])]);
export const inkOpacity=keyframes([{frame:0,value:.7},{frame:7,value:.95}]);
export const xShift=keyframes([{frame:0,value:0},{frame:7,value:4}]);
export const inkColor=[-.14,.8,2.7,.8] as const;
export function geometryTrace(trace:{projection:{parameter:number;point:readonly [number,number]};source:readonly [number,number]},context:FrameContext){return {source:pointSource(context),evaluated:cubicPoint(controlPoints,trace.projection.parameter),frozenPoint:trace.projection.point,sourceExpected:trace.source};}
