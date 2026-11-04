import type {Rational,TimeMapping} from '../core/types.ts';
import type {TVG,FrameContext} from '../core/types.ts';
import {compositionContext} from '../core/time.ts';
import {integer,fields,audioLimits,assertSampleRate,audioFail,type AudioSampleRate} from './block.ts';
export interface SampleInterval {unit:'samples';sampleRate:AudioSampleRate;start:number;endExclusive:number}
export function assertInterval(v:SampleInterval){fields(v,['unit','sampleRate','start','endExclusive'],'interval');if(v.unit!=='samples')audioFail('E_AUDIO_INTERVAL','Expected a sample interval');assertSampleRate(v.sampleRate);integer(v.start,'interval.start');integer(v.endExclusive,'interval.endExclusive',v.start+1,v.start+audioLimits.samples);}
function rational(fps:Rational){integer(fps?.num,'fps.num',1);integer(fps?.den,'fps.den',1);}
function number(v:bigint){if(v>BigInt(Number.MAX_SAFE_INTEGER)||v<BigInt(Number.MIN_SAFE_INTEGER))audioFail('E_AUDIO_TIME','Mapped sample endpoint exceeds safe integer range');return Number(v);}
/** Absolute endpoints, never a repeatedly rounded per-frame sample increment. */
export function frameToSample(frame:number,rate:AudioSampleRate,fps:Rational):number {integer(frame,'frame');assertSampleRate(rate);rational(fps);return number(BigInt(frame)*BigInt(rate)*BigInt(fps.den)/BigInt(fps.num));}
export function frameInterval(frame:number,rate:AudioSampleRate,fps:Rational):SampleInterval{return {unit:'samples',sampleRate:rate,start:frameToSample(frame,rate,fps),endExclusive:frameToSample(frame+1,rate,fps)};}
/** Reuse the existing Signal evaluator at absolute subframe sample positions.
 * The ordinary video-frame API still accepts integers only. */
export function compositionSampleContext(tvg:TVG,sample:number,rate:AudioSampleRate):FrameContext {
  integer(sample,'automation sample');assertSampleRate(rate);const fps=tvg.composition.fps,time=sample/rate,frame=time*fps.num/fps.den,base=compositionContext(tvg,Math.floor(frame));
  return {...base,frame,globalFrame:frame,time,globalTime:time,dt:1/rate,progress:tvg.composition.durationInFrames<=1?0:frame/(tvg.composition.durationInFrames-1)};
}
export function localInterval(global:SampleInterval,mapping:TimeMapping,fps:Rational):SampleInterval {
  assertInterval(global);rational(fps);integer(mapping.start,'stage.start');integer(mapping.offset,'stage.offset');
  // V1 has no implicit time stretching, reversed playback, freezing or sample-rate conversion.
  if(mapping.rate.num!==mapping.rate.den)audioFail('E_AUDIO_TIME_MAPPING','Audio v1 requires rate 1; explicit resampling/time-stretching is not implemented');
  const shift=frameToSample(mapping.offset,global.sampleRate,fps)-frameToSample(mapping.start,global.sampleRate,fps);
  const result={...global,start:global.start+shift,endExclusive:global.endExclusive+shift};assertInterval(result);return result;
}
