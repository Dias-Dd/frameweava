import type {Signal,Rational} from '../../src/core/types.ts';
import type {EditClip} from './types.ts';
import {clip,editInteger} from './authoring.ts';
import {fraction,add,multiply,compact,timeError} from './fractions.ts';
function timed(source:EditClip){if(source.asset.kind!=='video')timeError('Source retiming requires a video clip');if(source.sourceFrame!==undefined)timeError('This clip already has an absolute sourceFrame mapping; supply the combined mapping with remapClip()');return source.rate??{num:1,den:1};}
function withTime(source:EditClip,from:number|Rational,rate:Rational,duration:number){return clip(source.asset,{from,speed:rate,duration,fit:source.fit,sampling:source.sampling,transform:source.transform,effects:source.effects});}
/** Multiply this clip's source rate. By default duration preserves its half-open source span.
 * rate=0 explicitly holds the first sample. Audio is a separate, as-yet-unplaced stream. */
export function speedClip(source:EditClip,speed:number|Rational,options:{duration?:number}={}):EditClip {
 const previous=timed(source),factor=fraction(speed),rate=multiply(previous,factor);let duration=options.duration;
 if(duration===undefined){if(factor.num===0)duration=source.duration;else{const n=BigInt(source.duration)*BigInt(factor.den),d=BigInt(Math.abs(factor.num));duration=Number((n+d-1n)/d);}}
 editInteger(duration,'retimed duration',1);return withTime(source,source.sourceIn,rate,duration);
}
/** Reverses exactly the existing samples; applying twice restores the original mapping. */
export function reverseClip(source:EditClip):EditClip {
 const rate=timed(source),from=add(fraction(source.sourceIn),multiply(rate,{num:source.duration-1,den:1}));
 return withTime(source,compact(from),{num:-rate.num,den:rate.den},source.duration);
}
/** Pick a sample offset inside this clip, then hold it for an authored duration. */
export function freezeClip(source:EditClip,frame:number,duration=source.duration):EditClip {
 const rate=timed(source);editInteger(frame,'freeze sample offset');if(frame>=source.duration)timeError('Freeze sample must be inside the source clip');
 return withTime(source,compact(add(fraction(source.sourceIn),multiply(rate,{num:frame,den:1}))),{num:0,den:1},duration);
}
/** Core Signal/keyframe mapping to ABSOLUTE source project-frame positions.
 * It uses the existing Stage FrameContext, not an accumulated playback clock. */
export function remapClip(source:EditClip,sourceFrame:Signal<number>,options:{duration?:number}={}):EditClip {
 if(source.asset.kind!=='video')timeError('Source remapping requires a video clip');
 if(typeof sourceFrame!=='number'&&(!sourceFrame||typeof sourceFrame!=='object'||Array.isArray(sourceFrame)))timeError('Use a number or Core Signal/keyframes for sourceFrame');
 return clip(source.asset,{sourceFrame,duration:options.duration??source.duration,fit:source.fit,sampling:source.sampling,transform:source.transform,effects:source.effects});
}
