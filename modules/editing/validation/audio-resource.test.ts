import test from 'node:test';import assert from 'node:assert/strict';
import {audioSource} from '../audio.ts';import {audioBlock,audioSamples} from '../../../src/audio/block.ts';
import {encodeWav} from '../../../src/audio/wav.ts';
import {inspectAudioResource} from '../node.ts';
const metadata={resourceId:'sound',stream:0,sampleRate:48000,channels:1,layout:'mono',sampleCount:48000,decoder:'wav-pcm'};
const request={global:{unit:'samples',sampleRate:48000,start:0,endExclusive:8},local:{unit:'samples',sampleRate:48000,start:0,endExclusive:8},fps:{num:24,den:1},seed:0} as const;
const options={sampleRate:48000,layout:'mono',sampleCount:48000} as const;
function service(actual:any=metadata,read?:(r:any)=>any){return {info:async()=>actual,read:read??(async(r:any)=>audioBlock(Float32Array.from({length:r.interval.endExclusive-r.interval.start},(_,i)=>(i+r.interval.start)/48000),{sampleRate:48000,layout:'mono',startSample:r.interval.start}))};}
function init(audio?:unknown):any{return {sampleRate:48000,layout:'mono',durationSamples:48000,seed:0,audio,get resources(){throw Error('Whole-source Resource access must not occur');}};}
test('managed audio uses the real service contract before any whole-source getter and rebases source offsets',async()=>{
 const source=audioSource('sound','./long.wav',options),instance=await source(init(service())),result=await instance.evaluateInterval(request,{}, {editSourceOffsetSamples:24000});assert.equal(result.audio.startSample,0);assert.equal(result.audio.sampleCount,8);assert.equal(audioSamples(result.audio)[0],.5);
});
test('same local interval with different source offsets is not a stale library cache',async()=>{
 const instance=await audioSource('sound','./sound.wav',options)(init(service()));for(const offset of [24000,0,24000]){const r=await instance.evaluateInterval(request,{}, {editSourceOffsetSamples:offset});assert.equal(audioSamples(r.audio)[0],offset/48000);}
});
test('metadata/rate/layout mismatch and source coverage fail explicitly',async()=>{
 for(const mismatch of [{sampleCount:47999},{sampleRate:96000},{layout:'stereo'},{resourceId:'other'},{stream:1}])await assert.rejects(async()=>audioSource('sound','./sound.wav',options)(init(service({...metadata,...mismatch}))),{code:'E_EDIT_AUDIO_METADATA'});
 const instance=await audioSource('sound','./sound.wav',options)(init(service()));await assert.rejects(async()=>instance.evaluateInterval(request,{}, {editSourceOffsetSamples:47999}),{code:'E_EDIT_AUDIO'});
});
test('compressed sources require actual interval coverage rather than invented exact decoded length',async()=>{
 const actual={...metadata,decoder:'ffmpeg',sampleCount:undefined},good=await audioSource('sound','./sound.m4a',options)(init(service(actual)));assert.equal((await good.evaluateInterval(request,{},{})).audio.sampleCount,8);
 const bad=await audioSource('sound','./sound.m4a',options)(init(service(actual,async()=>audioBlock(new Float32Array(7),{sampleRate:48000,layout:'mono'}))));await assert.rejects(async()=>bad.evaluateInterval(request,{},{}),{code:'E_EDIT_AUDIO_COVERAGE'});
});
test('conversion and stream selection are explicit and snapshotted',async()=>{
 const conversion={sampleRate:'resample',layout:'remix'} as const,args:any[]=[];const source=audioSource('sound','./multi.mov',{...options,stream:1,conversion});
 const actual={...metadata,stream:1,sampleRate:44100,sampleCount:44100,layout:'stereo',channels:2};const instance=await source(init(service(actual,async r=>{args.push(r);return audioBlock(new Float32Array(8),{sampleRate:48000,layout:'mono',startSample:r.interval.start});})));await instance.evaluateInterval(request,{},{});assert.deepEqual(args[0],{resourceId:'sound',stream:1,interval:request.local,layout:'mono',conversion});assert.ok(Object.isFrozen((source as any)[Symbol.for('@frameweave/editing.audio-source')].conversion));
});
test('legacy Core retains exact small WAV behavior and refuses unavailable stream/conversion support',async()=>{
 const pcm=audioBlock(Float32Array.from({length:48000},(_,i)=>Math.fround(i/48000)),{sampleRate:48000,layout:'mono'}),bytes=encodeWav(pcm,{format:'float32',quantization:{clip:'reject',dither:{kind:'none'}}}).bytes;
 const legacy={sampleRate:48000,layout:'mono',durationSamples:48000,seed:0,resources:{sound:bytes}} as const;const instance=await audioSource('sound','./sound.wav',options)(legacy);assert.equal(audioSamples((await instance.evaluateInterval(request,{}, {editSourceOffsetSamples:24000})).audio)[0],.5);
 await assert.rejects(async()=>audioSource('sound','./sound.wav',{...options,stream:1})(legacy),{code:'E_EDIT_AUDIO_CORE'});
});
test('malformed service and conversion policies are rejected without silent fallback',async()=>{
 await assert.rejects(async()=>audioSource('sound','./sound.wav',options)(init(null)),{code:'E_EDIT_AUDIO_RESOURCE'});assert.throws(()=>audioSource('sound','./sound.wav',{...options,conversion:{sampleRate:'auto',layout:'remix'} as any}),{code:'E_EDIT_AUDIO'});
});
test('borrowed Resource metadata prepares long sources without loading or parsing whole-file bytes',async()=>{
 const info=await inspectAudioResource(service({...metadata,sampleCount:60480000}),'sound','./long.wav');assert.equal(info.sampleCount,60480000);assert.equal(info.sampleRate,48000);
 const converted=await inspectAudioResource(service({...metadata,sampleRate:44100,sampleCount:44101}),'sound','./rate.wav',{sampleRate:48000,conversion:{sampleRate:'resample',layout:'reject'}});assert.equal(converted.sampleCount,48001);
});
test('Node preparation never presents compressed duration metadata as exact PCM length',async()=>{
 const reader=service({...metadata,decoder:'ffmpeg',sampleCount:undefined});await assert.rejects(inspectAudioResource(reader,'sound','./track.m4a'),{code:'E_EDIT_AUDIO_METADATA'});
 const info=await inspectAudioResource(reader,'sound','./track.m4a',{sampleCount:24000});assert.equal(info.sampleCount,24000);
});
test('Node metadata mismatches and unsupported implicit conversions stay actionable',async()=>{
 await assert.rejects(inspectAudioResource(service({...metadata,sampleRate:44100}),'sound','./rate.wav'),{code:'E_EDIT_AUDIO'});await assert.rejects(inspectAudioResource(service(),'sound','./rate.wav',{sampleRate:96000}),{code:'E_EDIT_AUDIO_METADATA'});
});
