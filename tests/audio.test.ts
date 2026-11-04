import {test} from 'node:test';
import assert from 'node:assert/strict';
import {audioBlock,audioSamples,assertAudioBlock,sliceAudio,channelLayout} from '../src/audio/block.ts';
import {frameToSample,frameInterval,localInterval} from '../src/audio/time.ts';
import {generateAudio,gainAudio,panAudio,fadeAudio,mixAudio,audioPeaks} from '../src/audio/dsp.ts';
import {encodeWav,inspectWav,readWavBlock,encodePcm} from '../src/audio/wav.ts';
import {defineAudioStage,AUDIO_STAGE,assertAudioMetadata} from '../src/audio/contract.ts';

const interval=(start:number,endExclusive:number,sampleRate:48000|96000=48000)=>({unit:'samples' as const,start,endExclusive,sampleRate});
test('versioned audio metadata requires finite declared duration and explicitly rejects unimplemented state/DSP contracts',()=>{
  const factory=defineAudioStage({sampleRate:48000,layout:'mono',durationSamples:48000},()=>({evaluateInterval:()=>({value:1})}));assert.equal(factory[AUDIO_STAGE].seek,'stateless');assert.equal(Object.isFrozen(factory[AUDIO_STAGE]),true);
  for(const patch of [{seek:'preroll'},{latencySamples:12},{tailSamples:20},{lookbehindSamples:1},{lookaheadSamples:1},{schemaVersion:2},{durationSamples:Infinity},{unknown:true}])assert.throws(()=>assertAudioMetadata({...factory[AUDIO_STAGE],...patch}));
});
test('AudioBlock v1 owns finite Float32 bytes with explicit format, layout, coverage and budgets',()=>{
  const source=new Float32Array([-2,-.5,0,1,2,4]),block=audioBlock(source,{sampleRate:96000,layout:'stereo',startSample:15});source.fill(0);assert.deepEqual([...audioSamples(block)],[-2,-.5,0,1,2,4]);
  assert.equal(block.storage.byteLength,24);assert.deepEqual(block.channelLayout,channelLayout('stereo'));assert.equal(block.startSample,15);
  for(const bad of [{...block,schemaVersion:2},{...block,unknown:1},{...block,sampleRate:44100},{...block,channelLayout:{name:'stereo',channels:['FR','FL']}},{...block,sampleCount:262145},{...block,startSample:-1},{...block,storage:{...block.storage,byteLength:25}},{...block,validRange:{start:0,endExclusive:4}},{...block,storage:{...block.storage,encoding:'base64',data:'AAAA'}}])assert.throws(()=>assertAudioBlock(bad));
  const nan=structuredClone(block);new DataView(nan.storage.data.buffer).setFloat32(0,NaN,true);assert.throws(()=>assertAudioBlock(nan),/nonfinite/);
  const sliced=sliceAudio(block,16,18);assert.deepEqual([...audioSamples(sliced)],[0,1,2,4]);assert.throws(()=>sliceAudio({...block,validRange:{start:1,endExclusive:3}},15,16),/valid PCM/);
});
test('29.97 rational frame endpoints use absolute BigInt mapping and never accumulate rounding drift',()=>{
  const fps={num:30000,den:1001};for(const rate of [48000,96000] as const){const frame=12*60*60*30000,expected=Number(BigInt(frame)*BigInt(rate)*1001n/30000n);assert.equal(frameToSample(frame,rate,fps),expected);for(const f of [0,1,29,999999,frame])assert.equal(frameInterval(f,rate,fps).endExclusive,frameInterval(f+1,rate,fps).start);}
  assert.deepEqual(localInterval(interval(48000,49000),{start:12,duration:30,offset:6,rate:{num:1,den:1}},{num:12,den:1}),interval(24000,25000));assert.throws(()=>localInterval(interval(48000,49000),{start:0,duration:30,offset:0,rate:{num:2,den:1}},fps),/rate 1/);
});
test('48/96kHz authored sample functions match whole and partitioned/random intervals exactly',()=>{
  for(const sampleRate of [48000,96000] as const){const wave=({sample,time,channel}:{sample:number;time:number;channel:number})=>Math.sin(2*Math.PI*997*time+channel)*1.5+(sample%19)/200;const whole=generateAudio(interval(0,12000,sampleRate),'stereo',wave),a=generateAudio(interval(0,4999,sampleRate),'stereo',wave),b=generateAudio(interval(4999,12000,sampleRate),'stereo',wave);assert.deepEqual([...audioSamples(a),...audioSamples(b)],[...audioSamples(whole)]);assert.deepEqual(audioSamples(generateAudio(interval(4999,12000,sampleRate),'stereo',wave)),audioSamples(b));assert.ok(audioPeaks(whole).peaks[0]>1);}
});
test('gain, equal-power mono pan, stereo balance, fade and Float64 mix accumulator have explicit behavior',()=>{
  const block=audioBlock(new Float32Array([1,1,1,1]),{sampleRate:48000,layout:'mono'});assert.deepEqual([...audioSamples(gainAudio(block,2))],[2,2,2,2]);assert.deepEqual([...audioSamples(panAudio(block,-1))],[1,0,1,0,1,0,1,0]);
  const right=audioSamples(panAudio(block,1));assert.equal(right[1],1);assert.ok(Math.abs(right[0])<1e-15);
  assert.deepEqual([...audioSamples(fadeAudio(block,{start:0,endExclusive:4,inSamples:2,outSamples:1}))],[0,.5,1,0]);assert.deepEqual([...audioSamples(mixAudio([gainAudio(block,2),gainAudio(block,-1)]))],[1,1,1,1]);assert.equal(audioPeaks(gainAudio(block,2)).overloads[0],4);assert.throws(()=>mixAudio([block,{...block,startSample:1}]),/exact sample interval/);assert.throws(()=>panAudio(block,2),/Pan/);
});
test('WAV s16/s24/Float32 roundtrip, clipping, seeded TPDF and chunk-invariant final quantization',()=>{
  const block=generateAudio(interval(0,400),'stereo',({sample,channel})=>Math.sin(sample*.12+channel)*.8),none={clip:'reject' as const,dither:{kind:'none' as const}};
  for(const format of ['pcm16','pcm24','float32'] as const){const encoded=encodeWav(block,{format,quantization:none}),info=inspectWav(encoded.bytes),decoded=audioSamples(readWavBlock(encoded.bytes));assert.equal(info.format,format);assert.equal(info.sampleRate,48000);assert.equal(info.sampleCount,400);const original=audioSamples(block),error=Math.max(...decoded.map((v,i)=>Math.abs(v-original[i])));assert.ok(error<=(format==='pcm16'?1/32768:format==='pcm24'?1/8388608:0));}
  const policy={clip:'reject' as const,dither:{kind:'tpdf' as const,seed:45}},full=encodePcm(block,'pcm24',policy).bytes,a=encodePcm(sliceAudio(block,0,137),'pcm24',policy).bytes,b=encodePcm(sliceAudio(block,137,400),'pcm24',policy).bytes;assert.deepEqual([...a,...b],[...full]);assert.notDeepEqual(full,encodePcm(block,'pcm24',none).bytes);assert.deepEqual(full,encodePcm(block,'pcm24',policy).bytes);
  const overload=gainAudio(block,4);assert.throws(()=>encodePcm(overload,'pcm24',none),/overload/);assert.ok(encodePcm(overload,'pcm24',{...none,clip:'clip'}).overloads>0);assert.deepEqual(audioSamples(readWavBlock(encodeWav(overload,{format:'float32',quantization:none}).bytes)),audioSamples(overload));
  const corrupt=encodeWav(block,{format:'pcm16',quantization:none}).bytes;corrupt[4]++;assert.throws(()=>inspectWav(corrupt),/length/);
  const surround=audioBlock(new Float32Array(6*5),{sampleRate:96000,layout:'5.1'});assert.equal(inspectWav(encodeWav(surround,{format:'pcm24',quantization:none}).bytes).layout,'5.1');assert.throws(()=>panAudio(surround,0),/mono\/stereo/);
});
