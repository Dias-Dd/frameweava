import {audioBlock,audioSamples,assertAudioBlock,audioFail,integer,type AudioBlockV1,type AudioLayout,type AudioSampleRate} from './block.ts';
import type {SampleInterval} from './time.ts';
import {assertInterval} from './time.ts';
export interface AudioSampleContext {sample:number;time:number;sampleRate:AudioSampleRate;channel:number}
export function generateAudio(interval:SampleInterval,layout:AudioLayout,wave:(context:AudioSampleContext)=>number):AudioBlockV1 {
  assertInterval(interval);const channels={mono:1,stereo:2,quad:4,'5.1':6}[layout];if(!channels)audioFail('E_AUDIO_LAYOUT','Unknown generator layout');
  const data=new Float32Array((interval.endExclusive-interval.start)*channels);
  for(let i=0;i<data.length;i++){const sample=interval.start+Math.floor(i/channels),v=wave({sample,time:sample/interval.sampleRate,sampleRate:interval.sampleRate,channel:i%channels});if(!Number.isFinite(v))audioFail('E_AUDIO_FINITE',`Generator returned nonfinite sample ${sample}`);data[i]=v;}
  return audioBlock(data,{sampleRate:interval.sampleRate,layout,startSample:interval.start});
}
export function gainAudio(block:AudioBlockV1,gain:number|((sample:number)=>number)):AudioBlockV1 {
  const values=audioSamples(block),channels=block.channelLayout.channels.length;
  for(let i=0;i<values.length;i++){const g=typeof gain==='number'?gain:gain(block.startSample+Math.floor(i/channels));if(!Number.isFinite(g))audioFail('E_AUDIO_GAIN','Gain must be finite');values[i]*=g;}
  return audioBlock(values,{sampleRate:block.sampleRate,layout:block.channelLayout.name,startSample:block.startSample});
}
/** Stereo balance preserves center amplitude; mono uses equal-power stereo placement. */
export function panAudio(block:AudioBlockV1,pan:number|((sample:number)=>number)):AudioBlockV1 {
  if(block.channelLayout.name!=='mono'&&block.channelLayout.name!=='stereo')audioFail('E_AUDIO_LAYOUT','Pan v1 supports explicitly mono/stereo only');
  const input=audioSamples(block),n=block.channelLayout.channels.length,values=new Float32Array(block.sampleCount*2);
  for(let i=0;i<block.sampleCount;i++){const p=typeof pan==='number'?pan:pan(block.startSample+i);if(!Number.isFinite(p)||p< -1||p>1)audioFail('E_AUDIO_PAN','Pan must be finite in [-1,1]');
    if(n===1){values[i*2]=p===1?0:input[i]*Math.cos((p+1)*Math.PI/4);values[i*2+1]=p===-1?0:input[i]*Math.sin((p+1)*Math.PI/4);}
    else {values[i*2]=input[i*2]*(p>0?Math.cos(p*Math.PI/2):1);values[i*2+1]=input[i*2+1]*(p<0?Math.cos(p*Math.PI/2):1);}
  }return audioBlock(values,{sampleRate:block.sampleRate,layout:'stereo',startSample:block.startSample});
}
export function fadeAudio(block:AudioBlockV1,options:{start:number;endExclusive:number;inSamples?:number;outSamples?:number}):AudioBlockV1 {
  const {start,endExclusive}=options;integer(start,'fade.start');integer(endExclusive,'fade.end',start+1);const length=endExclusive-start,fadeIn=options.inSamples??0,fadeOut=options.outSamples??0;integer(fadeIn,'fade.in',0,length);integer(fadeOut,'fade.out',0,length);
  return gainAudio(block,sample=>sample<start||sample>=endExclusive?0:Math.min(1,fadeIn?(sample-start)/fadeIn:1,fadeOut?(endExclusive-1-sample)/fadeOut:1));
}
export function mixAudio(blocks:readonly AudioBlockV1[]):AudioBlockV1 {
  if(!blocks.length)audioFail('E_AUDIO_MIX','Mix requires at least one block');const first=blocks[0];assertAudioBlock(first);const sum=new Float64Array(first.sampleCount*first.channelLayout.channels.length);
  for(const block of blocks){assertAudioBlock(block);if(block.sampleRate!==first.sampleRate||block.channelLayout.name!==first.channelLayout.name||block.startSample!==first.startSample||block.sampleCount!==first.sampleCount)audioFail('E_AUDIO_MIX','Mix inputs must match rate, named layout and exact sample interval');if(block.validRange.start!==0||block.validRange.endExclusive!==block.sampleCount)audioFail('E_AUDIO_COVERAGE','Mix requires complete input coverage');const samples=audioSamples(block);for(let i=0;i<sum.length;i++)sum[i]+=samples[i];}
  return audioBlock(Float32Array.from(sum),{sampleRate:first.sampleRate,layout:first.channelLayout.name,startSample:first.startSample});
}
export function audioPeaks(block:AudioBlockV1){const samples=audioSamples(block),channels=block.channelLayout.channels.length,peaks=Array<number>(channels).fill(0),overloads=Array<number>(channels).fill(0);for(let i=0;i<samples.length;i++){const value=Math.abs(samples[i]),c=i%channels;peaks[c]=Math.max(peaks[c],value);if(value>1)overloads[c]++;}return {peaks,overloads,clipped:overloads.some(v=>v>0)};}
