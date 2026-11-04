import {createTrackReader,queryStageTrack,validateTrackData} from '../../graphics-contracts/track.ts';
import type {ImageFrame} from './types.ts';import {authoringError} from './runtime.ts';
export interface TrackPointOptions {sourceStartSeconds?:number;rate?:number}
/** Reuse the unchanged analysis.track/1 reader and missing/gap semantics.
 * Output is ordinary control data: feed x/y into any original pixel-space option.
 * No hidden keyframes, model execution or implicit cross-gap interpolation. */
export function trackPoint(input:unknown,options:TrackPointOptions={}) {
  if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(k=>!['sourceStartSeconds','rate'].includes(k)))authoringError('trackPoint.options','expected explicit source start seconds and playback rate');
  const data=validateTrackData(input),reader=createTrackReader(data),sourceStartSeconds=options.sourceStartSeconds??data.time.startUs/1e6,rate=options.rate??1;
  if(!Number.isFinite(sourceStartSeconds)||sourceStartSeconds<0||!Number.isFinite(rate))authoringError('trackPoint.mapping','expected finite nonnegative source start and finite rate');
  return (frame:ImageFrame)=>{if(!frame.context)authoringError('trackPoint.context','FrameContext is required');return queryStageTrack(reader,frame.context.time,{sourceStartSeconds,rate},{unit:'px',origin:'top-left',x:'right',y:'down',width:frame.init.width,height:frame.init.height,spaceId:'authoring-image'});};
}
