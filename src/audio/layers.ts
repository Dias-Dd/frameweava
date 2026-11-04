import type {LayerSpec,Signal,TVG} from '../core/types.ts';
import {evaluate} from '../core/animation.ts';
import {audioBlock,audioSamples,assertAudioBlock,audioFail,integer,fields,type AudioBlockV1,type AudioSampleRate,type AudioLayout} from './block.ts';
import {assertAudioMetadata} from './contract.ts';
import {frameToSample,compositionSampleContext,type SampleInterval,assertInterval} from './time.ts';
/** Structural bridge agreed with FW-1. Public Layer authoring remains owned by Agent-2. */
export type AudioLayer=LayerSpec&{gain?:Signal<number>;pan?:Signal<number>;audio?:{startSample?:number;sourceOffsetSamples?:number;sourceEndSample?:number}};
export type IntervalEvaluator=(interval:SampleInterval,stageId:string)=>Promise<{stageOutputs:Record<string,Record<string,unknown>>}>;
function signalAt(tvg:TVG,signal:Signal<number>|undefined,sample:number,rate:AudioSampleRate,fallback:number){const result=evaluate(signal??fallback,compositionSampleContext(tvg,sample,rate));if(typeof result!=='number'||!Number.isFinite(result))audioFail('E_AUDIO_AUTOMATION','Audio automation must evaluate to a finite number');return result;}
export function describeAudioLayers(tvg:TVG,rate:AudioSampleRate){
  const audio=[];
  for(const layer of tvg.layers as AudioLayer[]){if(!layer.source)continue;const source=tvg.stages.find(s=>s.id===layer.source!.$ref);if(source?.outputs[layer.source.port]!=='audio')continue;assertAudioMetadata(source.audio);
    if(layer.audio)fields(layer.audio,['startSample','sourceOffsetSamples','sourceEndSample'],'Layer.audio');
    if(source.audio.sampleRate!==rate)audioFail('E_AUDIO_RATE','Audio layer sample rates differ; an explicit resampling module is required');
    const frameStart=frameToSample(layer.start,rate,tvg.composition.fps),nextFrame=frameToSample(layer.start+1,rate,tvg.composition.fps),start=layer.audio?.startSample??frameStart;
    integer(start,'Layer.audio.startSample',frameStart,nextFrame-1);const offset=layer.audio?.sourceOffsetSamples??0,sourceEnd=layer.audio?.sourceEndSample??source.audio.durationSamples;integer(offset,'Layer.audio.sourceOffsetSamples',0,source.audio.durationSamples-1);integer(sourceEnd,'Layer.audio.sourceEndSample',offset+1,source.audio.durationSamples);
    const end=Math.min(frameToSample(layer.end,rate,tvg.composition.fps),start+sourceEnd-offset);if(end<=start)audioFail('E_AUDIO_LAYER','Audio layer has an empty sample interval');
    audio.push({layer,source,start,end,offset,sourceEnd});
  }return audio;
}
export function audioProjectInfo(tvg:TVG,rate:AudioSampleRate){const layers=describeAudioLayers(tvg,rate);if(!layers.length)audioFail('E_AUDIO_EMPTY','No placed audio content');return {sampleCount:frameToSample(tvg.composition.durationInFrames,rate,tvg.composition.fps),hasVisual:tvg.layers.some(l=>l.source&&tvg.stages.find(s=>s.id===l.source!.$ref)?.outputs[l.source.port]==='surface'),tracks:layers.map(l=>({id:l.layer.id,startSample:l.start,endSample:l.end,sourceOffsetSamples:l.offset,sourceEndSample:l.sourceEnd}))};}
/** Ordinary Layer audio placement. Silence outside authored content is an explicit mixer policy. */
export async function mixAudioLayers(tvg:TVG,interval:SampleInterval,options:{layout:'mono'|'stereo';evaluate:IntervalEvaluator;gap:'silence'}):Promise<AudioBlockV1>{
  assertInterval(interval);if(options.gap!=='silence')audioFail('E_AUDIO_GAP','Mixer requires explicit silence policy outside placed clips');
  const channels=options.layout==='mono'?1:2,sum=new Float64Array((interval.endExclusive-interval.start)*channels),layers=describeAudioLayers(tvg,interval.sampleRate);
  for(const {layer,source,start,end,offset}of layers){const first=Math.max(interval.start,start),last=Math.min(interval.endExclusive,end);if(last<=first)continue;
    const localStart=offset+first-start,localEnd=offset+last-start,stageShift=frameToSample(source.time.start,interval.sampleRate,tvg.composition.fps)-frameToSample(source.time.offset,interval.sampleRate,tvg.composition.fps);
    const rendered=await options.evaluate({unit:'samples',sampleRate:interval.sampleRate,start:localStart+stageShift,endExclusive:localEnd+stageShift},source.id),block=rendered.stageOutputs[source.id]?.[layer.source!.port];assertAudioBlock(block);
    if(block.startSample!==localStart||block.sampleCount!==localEnd-localStart||block.validRange.start!==0||block.validRange.endExclusive!==block.sampleCount)audioFail('E_AUDIO_COVERAGE','Audio Layer source did not cover the exact requested material interval');
    if(block.sampleRate!==interval.sampleRate||!['mono','stereo'].includes(block.channelLayout.name))audioFail('E_AUDIO_LAYOUT','Mixer v1 accepts explicit mono/stereo at the selected rate only');
    const input=audioSamples(block),sourceChannels=block.channelLayout.channels.length;if(channels===1&&sourceChannels!==1)audioFail('E_AUDIO_LAYOUT','Stereo-to-mono requires an explicit downmix module');
    const parents:AudioLayer[]=[];let parent=layer.parent;while(parent){const group=(tvg.layers as AudioLayer[]).find(l=>l.id===parent);if(!group)audioFail('E_AUDIO_LAYER','Missing audio Layer group');parents.push(group);parent=group.parent;if(parents.length>tvg.layers.length)audioFail('E_AUDIO_LAYER','Cyclic audio Layer groups');}
    for(let i=0;i<block.sampleCount;i++){const sample=first+i,out=(sample-interval.start)*channels;let gain=signalAt(tvg,layer.gain,sample,interval.sampleRate,1),pan=signalAt(tvg,layer.pan,sample,interval.sampleRate,0);
      if(gain<0)audioFail('E_AUDIO_GAIN','Layer gain must be nonnegative; explicit phase inversion belongs in an Audio Stage');
      for(const p of parents){if(sample<frameToSample(p.start,interval.sampleRate,tvg.composition.fps)||sample>=frameToSample(p.end,interval.sampleRate,tvg.composition.fps)){gain=0;break;}const g=signalAt(tvg,p.gain,sample,interval.sampleRate,1);if(g<0)audioFail('E_AUDIO_GAIN','Group gain must be nonnegative');gain*=g;if(p.pan!==undefined)audioFail('E_AUDIO_PAN','Group pan requires an explicit bus Stage in v1');}
      if(pan< -1||pan>1)audioFail('E_AUDIO_PAN','Layer pan must evaluate into [-1,1]');
      if(channels===1){if(pan!==0)audioFail('E_AUDIO_PAN','Mono output does not support pan');sum[out]+=input[i]*gain;}
      else if(sourceChannels===1){sum[out]+=pan===1?0:input[i]*gain*Math.cos((pan+1)*Math.PI/4);sum[out+1]+=pan===-1?0:input[i]*gain*Math.sin((pan+1)*Math.PI/4);}
      else {sum[out]+=input[i*2]*gain*(pan>0?Math.cos(pan*Math.PI/2):1);sum[out+1]+=input[i*2+1]*gain*(pan<0?Math.cos(pan*Math.PI/2):1);}
    }
  }return audioBlock(Float32Array.from(sum),{sampleRate:interval.sampleRate,layout:options.layout,startSample:interval.start});
}
