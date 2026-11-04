import {keyframes,evaluate} from '../../../../src/core/animation.ts';
import type {FrameContext} from '../../../../src/core/types.ts';
import * as k from '../../src/keyframe-control/index.ts';
export const loopKeys=keyframes([{frame:1,value:.05},{frame:3,value:.32,easing:'easeIn' as const}]);
export const inverseKeys=keyframes([{frame:0,value:0},{frame:7,value:1,easing:{bezier:[.2,1.4,.8,-.4] as [number,number,number,number]}}]);
export const inkAlpha=keyframes([{frame:0,value:.7},{frame:7,value:.9}]);
export type Mode='offset'|'ping-pong'|'continue'|'inverse';
export function sourceSeconds(mode:Mode,context:FrameContext){
 if(mode==='inverse'){const desired=Math.max(.05,Math.min(.95,.05+.9*context.frame/7)),inverse=k.invertKeyframeValue(inverseKeys,desired,{policy:'nearest',nearFrame:context.frame});if(inverse.frame===null)throw Error('Explicit inverse target has no real source time');return inverse.frame/7*.9;}
 return k.loopKeyframeValue(loopKeys,context,{before:mode==='continue'?'continue':'hold',after:mode});
}
export function controlsAt(context:FrameContext){
 const shifted=k.shiftKeyframes(loopKeys,2),retimed=k.retimeKeyframes(loopKeys,{start:0,end:7}),reversed=k.reverseKeyframes(retimed),mapped=k.mapKeyframeValues(retimed,v=>v*2),grid=k.quantizeKeyframeTimes(k.shiftKeyframes(loopKeys,.2),{grid:1}),spliced=k.spliceKeyframes([loopKeys,shifted],{collision:'last'}),valueGrid=k.quantizeKeyframeValues(mapped,{step:.05}),normalized=k.normalizeKeyframes(inverseKeys,{min:0,max:1}),target=Math.max(.05,Math.min(.95,.05+.9*context.frame/7)),inverse=k.invertKeyframeValue(inverseKeys,target,{policy:'nearest',nearFrame:context.frame}),plateau=k.invertKeyframeValue(keyframes([{frame:0,value:0},{frame:7,value:1,easing:'step'}]),0,{policy:'last'});
 return {span:k.keyframeSpan(loopKeys),nearest:k.nearestKeyframe(loopKeys,context.frame),range:k.keyframesBetween(spliced,0,7),shifted,retimed,reversed,mapped,grid,spliced,valueGrid,normalized,offset:k.loopKeyframeValue(loopKeys,context,{after:'offset'}),pingPong:k.loopKeyframeValue(loopKeys,context,{after:'ping-pong'}),continued:k.loopKeyframeValue(loopKeys,context,{before:'continue',after:'continue'}),motion:k.sampleKeyframeMotion(retimed,context),integral:k.integrateKeyframes(retimed,0,context.frame,context),average:k.averageKeyframes(retimed,context,{widthFrames:1}),bounds:k.keyframeValueBounds(inverseKeys),crossings:k.findKeyframeCrossings(inverseKeys,target),inverse,plateau,events:k.keyframeEventsBetween(loopKeys,context.frame-1,context.frame),blended:k.blendKeyframeValues(retimed,reversed,.35,context),pulse:k.keyframePulse(loopKeys,context,{widthFrames:1.5}),alpha:evaluate(inkAlpha,context)};
}
