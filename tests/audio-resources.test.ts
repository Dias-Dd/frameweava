import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readFile,open,copyFile,appendFile} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {join} from 'node:path';
import {build as bundle} from 'esbuild';
import {engineRoot,buildProject} from '../src/compiler/build.ts';
import {AudioAdapter} from '../src/audio/adapter.ts';
import {AudioResourceReader} from '../src/audio/resources.ts';
import {audioBlock,audioSamples,type AudioBlockV1} from '../src/audio/block.ts';
import {wavHeader,readWavBlock} from '../src/audio/wav.ts';
import {decodeAudioFile} from '../src/audio/io.ts';
import {ffmpegPath} from '../src/encoding/ffmpeg.ts';
import type {BuiltProject,StageSpec} from '../src/core/types.ts';
import type {AudioResourceRequest,AudioStageMetadata,IntervalRequest} from '../src/audio/contract.ts';
import {openRenderSession} from '../modules/render-session/index.ts';
import {exportAudioProject} from '../src/audio/service.ts';
import {frameToSample} from '../src/audio/time.ts';
const exec=promisify(execFile),rate=48000 as const,largeCount=4194305;
let root:string,long:string,short:string,flac:string,mov:string,aac:string;
const sample=(frame:number,channel:number)=>Math.fround((((frame%251)-125)/128)*(channel?-.5:1))||0;
async function wave(file:string,count:number){const handle=await open(file,'wx');try{await handle.write(wavHeader({sampleRate:rate,layout:'stereo',sampleCount:count,format:'float32'}));
  for(let start=0;start<count;start+=8192){const n=Math.min(8192,count-start),bytes=Buffer.alloc(n*8);for(let i=0;i<n;i++)for(let c=0;c<2;c++)bytes.writeFloatLE(sample(start+i,c),(i*2+c)*4);await handle.write(bytes);}
}finally{await handle.close();}}
const read=(resourceId:string,start:number,count=64):AudioResourceRequest=>({resourceId,stream:0,interval:{unit:'samples',sampleRate:rate,start,endExclusive:start+count},layout:'stereo',conversion:{sampleRate:'reject',layout:'reject'}});
const metadata:AudioStageMetadata={schemaVersion:1,sampleRate:rate,layout:'stereo',durationSamples:largeCount,seek:'stateless',lookbehindSamples:0,lookaheadSamples:0,latencySamples:0,tailSamples:0};
async function fixture(body='export default()=>({evaluateInterval(){return {};}})',files:Record<string,string>={long}){
  const dir=await mkdtemp(join(root,'build-'));await mkdir(join(dir,'assets'));const resources:BuiltProject['manifest']['resources']=[],assets:BuiltProject['assets']={};
  for(const [id,file]of Object.entries(files)){const ext=file.slice(file.lastIndexOf('.')),src=`assets/${id}${ext}`;await copyFile(file,join(dir,src));resources.push({id,src,kind:'file'});assets[src]=join(dir,src);}
  await writeFile(join(dir,'stage.ts'),`import {audioSamples,readWavBlock} from ${JSON.stringify(join(engineRoot,'src/audio/index.ts').replaceAll('\\','/'))};${body}`);
  await bundle({entryPoints:[join(dir,'stage.ts')],outfile:join(dir,'stage.js'),format:'iife',globalName:'__fw_audio_module',platform:'browser',bundle:true,logLevel:'silent'});
  const stage:StageSpec={id:'sound',engine:'audio',entry:'stage.ts',exportName:'default',audio:metadata,inputs:{},outputs:{audio:'audio',state:'json'},props:{},time:{start:0,duration:3000,offset:0,rate:{num:1,den:1}},seek:'stateless'};
  const built:BuiltProject={dir,manifest:{schemaVersion:'0.1',composition:{id:'audio',width:1,height:1,fps:{num:30000,den:1001},durationInFrames:3000,background:'transparent',seed:1},stages:[stage],layers:[],resources,effects:[]},assets,stageBundles:{sound:'stage.js'},hash:''};
  const manifest=JSON.stringify(built.manifest,null,2);await writeFile(join(dir,'tvg.json'),manifest);const digest=createHash('sha256').update(manifest);
  for(const file of [join(dir,'stage.js'),...Object.values(assets)].sort())for await(const bytes of createReadStream(file))digest.update(bytes);built.hash=digest.digest('hex');return {built,stage};
}
function verify(block:AudioBlockV1,start:number,count:number,scale=1){assert.equal(block.startSample,start);assert.equal(block.sampleCount,count);const values=audioSamples(block);for(let i=0;i<count;i++)for(let c=0;c<2;c++)assert.equal(values[i*2+c],sample(start+i,c)*scale);}
before(async()=>{const parent=join(engineRoot,'.frameweave/main-audio-interval');await mkdir(parent,{recursive:true});root=await mkdtemp(join(parent,'test-'));long=join(root,'long.wav');short=join(root,'short.wav');await wave(long,largeCount);await wave(short,6*rate);});
after(async()=>{await writeFile(join(root,'evidence.json'),JSON.stringify({root,long,short,flac,mov,aac,longSamples:largeCount,sourceSeconds:largeCount/rate,ffmpeg:ffmpegPath(),ffprobe:process.env.FRAMEWEAVE_FFPROBE},null,2));});

test('87.381s WAV: late 64 samples, unrelated large asset, exact random access, bounded/value-owned cache',async()=>{
  const visual=join(root,'visual.bin'),handle=await open(visual,'wx');await handle.truncate(40*1024**2);await handle.close();
  const {built}=await fixture(undefined,{long,visual}),reader=new AudioResourceReader(built,{maxRequestBytes:512,maxCacheBytes:1024});
  try{const at=60*rate,first=await reader.read(read('long',at));verify(first,at,64);assert.equal(reader.stats().sourceBytesRead,512);assert.equal(reader.stats().openSources,1);
    first.storage.data.fill(0);verify(await reader.read(read('long',at)),at,64);verify(await reader.read(read('long',0)),0,64);verify(await reader.read(read('long',at)),at,64);
    assert.ok(reader.stats().cacheHits>=2);assert.ok(reader.stats().cacheBytes<=1024);assert.equal((await reader.info('long',0)).sampleCount,largeCount);
    await assert.rejects(reader.read(read('long',0,65)),{code:'E_AUDIO_BUDGET'});
    await assert.rejects(reader.bytes('long'),{code:'E_AUDIO_RESOURCE_BUDGET'});
  }finally{await Promise.all([reader.close(),reader.close()]);assert.equal(reader.stats().openSources,0);assert.equal(reader.stats().cacheBytes,0);}
});
test('declared IDs, complete coverage, explicit conversions and compiled-byte integrity are enforced',async()=>{
  const {built}=await fixture(undefined,{short}),reader=new AudioResourceReader(built);
  try{await assert.rejects(reader.read(read('../short',0)),{code:'E_AUDIO_RESOURCE_UNDECLARED'});await assert.rejects(reader.info('short',1),{code:'E_AUDIO_STREAM'});
    await assert.rejects(reader.read(read('short',6*rate-32)),{code:'E_AUDIO_COVERAGE'});
    await assert.rejects(reader.read({...read('short',0),layout:'mono'}),{code:'E_AUDIO_CONVERSION'});
    verify(await reader.read(read('short',12)),12,64);await appendFile(built.assets['assets/short.wav'],new Uint8Array([0]));
    await assert.rejects(reader.read(read('short',12)),{code:'E_AUDIO_RESOURCE_INTEGRITY'});assert.equal(reader.stats().openSources,0);
  }finally{await reader.close();}
  const corrupt=await fixture(undefined,{short});await appendFile(corrupt.built.assets['assets/short.wav'],new Uint8Array([0]));const rejected=new AudioResourceReader(corrupt.built);
  try{await assert.rejects(rejected.read(read('short',0)),{code:'E_AUDIO_RESOURCE_INTEGRITY'});}finally{await rejected.close();}
});
test('fresh Audio realms use typed interval RPC and lazy legacy bytes without exposing host objects',async()=>{
  const note=join(root,'note.txt');await writeFile(note,'OK');
  const {built,stage}=await fixture(`let residue=0;export default init=>({async evaluateInterval(r){residue++;const source=await init.audio.info('long',0),audio=await init.audio.read({resourceId:'long',stream:0,interval:r.local,layout:'stereo',conversion:{sampleRate:'reject',layout:'reject'}});return {audio,state:{residue,source,legacy:Array.from(init.resources.note),realm:audio.storage.data instanceof Uint8Array,process:typeof process,wasm:typeof WebAssembly,sab:typeof SharedArrayBuffer}};}});`,{long,note});
  const adapter=new AudioAdapter(built,20000,undefined,{maxLegacyBytes:2,maxCacheBytes:2048}),local=read('long',60*rate).interval,request:IntervalRequest={global:local,local,fps:{num:30000,den:1001},seed:1};
  try{await adapter.init(stage);assert.equal(adapter.resourceStats().sourceOpens,0);const first=await adapter.evaluateInterval(stage,request,{},{}),again=await adapter.evaluateInterval(stage,request,{},{});assert.deepEqual(first,again);verify(first.outputs.audio as AudioBlockV1,local.start,64);
    const state=first.outputs.state as any;assert.deepEqual(state.legacy,[79,75]);assert.equal(state.residue,1);assert.equal(state.realm,true);assert.equal(state.process,'undefined');assert.equal(state.wasm,'undefined');assert.equal(state.sab,'undefined');assert.equal(state.source.sampleCount,largeCount);
    assert.ok(adapter.resourceStats().cacheHits>=2);
  }finally{await adapter.dispose();assert.equal(adapter.resourceStats().openSources,0);}
});
test('RPC copies use captured realm primitives after authored constructor/prototype changes',async()=>{
  const {built,stage}=await fixture(`export default init=>({async evaluateInterval(r){const U=Uint8Array;U.prototype.set=()=>{throw Error('Authored set hook must not receive host data');};globalThis.Uint8Array=function(){throw Error('Authored constructor must not allocate RPC replies');};const audio=await init.audio.read({resourceId:'short',stream:0,interval:r.local,layout:'stereo',conversion:{sampleRate:'reject',layout:'reject'}});return {audio,state:{realm:audio.storage.data instanceof U}};}});`,{short});
  const adapter=new AudioAdapter(built),local=read('short',0).interval;try{await adapter.init(stage);const result=await adapter.evaluateInterval(stage,{local,global:local,fps:{num:24,den:1},seed:1},{},{});verify(result.outputs.audio as AudioBlockV1,0,64);assert.deepEqual(result.outputs.state,{realm:true});}finally{await adapter.dispose();}
});
test('six-second source is chunk-readable; persistent compressed/container decoders preserve exact stream/sample access',{timeout:60000},async()=>{
  assert.ok(process.env.FRAMEWEAVE_FFPROBE,'Qualification requires explicit FRAMEWEAVE_FFPROBE');
  await assert.rejects(decodeAudioFile(short,{sampleRate:rate,layout:'stereo'}),{code:'E_AUDIO_BUDGET'}); // retained bounded whole-block API, not the new interval service
  flac=join(root,'short.flac');mov=join(root,'tracks.mov');aac=join(root,'sound.mp4');
  await exec(ffmpegPath(),['-v','error','-nostdin','-i',short,'-c:a','flac',flac],{windowsHide:true,timeout:15000});
  await exec(ffmpegPath(),['-v','error','-nostdin','-i',short,'-f','lavfi','-i','color=c=black:s=16x16:r=1:d=6','-map','1:v:0','-map','0:a:0','-map','0:a:0','-c:v','libx264','-threads','1','-preset','ultrafast','-c:a','pcm_f32le','-filter:a:1','volume=0.5',mov],{windowsHide:true,timeout:15000});
  await exec(ffmpegPath(),['-v','error','-nostdin','-i',mov,'-map','0:v:0','-map','0:a:0','-c:v','copy','-c:a','aac',aac],{windowsHide:true,timeout:15000});
  const wav44=join(root,'44k.wav');await exec(ffmpegPath(),['-v','error','-nostdin','-i',short,'-ar','44100','-c:a','pcm_f32le',wav44],{windowsHide:true,timeout:15000});
  const {built}=await fixture(undefined,{short,flac,mov,aac,wav44}),reader=new AudioResourceReader(built,{maxCacheBytes:4096});
  try{verify(await reader.read(read('short',5*rate,256)),5*rate,256);
    // FLAC quantizes floating source to s24, exactly representable for this fixture.
    verify(await reader.read(read('flac',100,256)),100,256);verify(await reader.read(read('flac',356,128)),356,128);assert.equal(reader.stats().decoderStarts,1);
    verify(await reader.read(read('flac',100,256)),100,256);assert.equal(reader.stats().decoderStarts,1);
    verify(await reader.read(read('flac',0,64)),0,64);assert.equal(reader.stats().decoderRestarts,1);
    verify(await reader.read({...read('mov',5*rate,128),stream:1}),5*rate,128,.5);
    const [info0,info1]=await Promise.all([reader.info('mov',0),reader.info('mov',1)]);assert.equal(info0.decoder,'ffmpeg');assert.equal(info1.channels,2);
    await assert.rejects(reader.info('mov',2),{code:'E_AUDIO_STREAM'});
    const reference=await exec(ffmpegPath(),['-v','error','-nostdin','-i',aac,'-map','0:a:0','-af','aresample=48000:async=0','-ac','2','-channel_layout','stereo','-f','f32le','pipe:1'],{windowsHide:true,encoding:'buffer',maxBuffer:4*1024**2,timeout:15000});
    const first=await reader.read(read('aac',8000,192));assert.deepEqual(Buffer.from(first.storage.data),reference.stdout.subarray(8000*8,(8000+192)*8));
    const converted=await reader.read({...read('short',17,192),interval:{unit:'samples',sampleRate:96000,start:17,endExclusive:209},layout:'mono',conversion:{sampleRate:'resample',layout:'remix'}});
    const convertedReference=await exec(ffmpegPath(),['-v','error','-nostdin','-f','wav','-i',short,'-af','aresample=96000:async=0','-ac','1','-channel_layout','mono','-f','f32le','pipe:1'],{windowsHide:true,encoding:'buffer',maxBuffer:4*1024**2,timeout:15000});
    assert.deepEqual(Buffer.from(converted.storage.data),convertedReference.stdout.subarray(17*4,209*4));
    assert.equal((await reader.info('wav44',0)).sampleRate,44100);await assert.rejects(reader.read(read('wav44',0)),{code:'E_AUDIO_CONVERSION'});
    const from44=await reader.read({...read('wav44',317,128),conversion:{sampleRate:'resample',layout:'reject'}});
    const ref44=await exec(ffmpegPath(),['-v','error','-nostdin','-f','wav','-i',wav44,'-af','aresample=48000:async=0','-ac','2','-channel_layout','stereo','-f','f32le','pipe:1'],{windowsHide:true,encoding:'buffer',maxBuffer:4*1024**2,timeout:15000});assert.deepEqual(Buffer.from(from44.storage.data),ref44.stdout.subarray(317*8,445*8));
    await assert.rejects(reader.read(read('aac',10*rate)),{code:'E_AUDIO_COVERAGE'});
  }finally{await reader.close();assert.equal(reader.stats().openDecoders,0);assert.equal(reader.stats().openSources,0);}
  const external=join(root,'external.mov'),bytes=await readFile(mov),dref=bytes.indexOf(Buffer.from('dref'));assert.ok(dref>0);bytes.writeUInt32BE(0,dref+20);await writeFile(external,bytes);
  const bad=await fixture(undefined,{external}),isolated=new AudioResourceReader(bad.built);
  try{await assert.rejects(isolated.info('external',0),{code:'E_AUDIO_CONTAINER'});assert.equal(isolated.stats().decoderStarts,0);}finally{await isolated.close();}
});
test('cancel/close release actual host decoder leases and reject pending/new requests',async()=>{
  const {built}=await fixture(undefined,{short}),reader=new AudioResourceReader(built,{maxCacheBytes:0});
  const converted={...read('short',0),layout:'mono' as const,conversion:{sampleRate:'reject' as const,layout:'remix' as const}};
  await reader.read(converted);assert.equal(reader.stats().openDecoders,1);
  const cancelled=reader.read({...converted,interval:{...converted.interval,start:1000000,endExclusive:1000064}},AbortSignal.abort());await assert.rejects(cancelled,{code:'E_RENDER_CANCELLED'});
  const pending=reader.read({...converted,interval:{...converted.interval,start:10000000,endExclusive:10000064}});const rejected=assert.rejects(pending,{code:'E_RENDER_CANCELLED'});await reader.close();await rejected;
  await assert.rejects(reader.read(converted),{code:'E_RENDER_CANCELLED'});assert.equal(reader.stats().openDecoders,0);assert.equal(reader.stats().openSources,0);
  const active=new AudioResourceReader(built,{maxCacheBytes:0,decoderTimeoutMs:3000}),controller=new AbortController();
  const task=active.read({...converted,interval:{...converted.interval,start:10000000,endExclusive:10000064}},controller.signal),failed=assert.rejects(task,{code:'E_RENDER_CANCELLED'});
  try{for(let i=0;i<1000&&active.stats().decoderStarts===0;i++)await new Promise(r=>setTimeout(r,1));assert.equal(active.stats().decoderStarts,1);controller.abort();await failed;assert.equal(active.stats().openDecoders,0);assert.equal(active.stats().openSources,0);}finally{controller.abort();await active.close();}
});
test('official TSX -> Audio A/B PortRef -> Session -> decoded WAV, exact NTSC endpoints and source seals',{timeout:120000},async()=>{
  const projectDir=join(root,'project');await mkdir(projectDir);await copyFile(long,join(projectDir,'long.wav'));const project=join(projectDir,'project.tsx');
  await writeFile(project,`import {Composition,Stage,Layer,Resource,ref} from '@frameweave/engine';import {defineAudioStage,audioBlock,audioSamples} from '@frameweave/engine/audio';
export const source=defineAudioStage({sampleRate:48000,layout:'stereo',durationSamples:48000},init=>({async evaluateInterval(r){const b=await init.audio.read({resourceId:'music',stream:0,interval:{...r.local,start:r.local.start+2880000,endExclusive:r.local.endExclusive+2880000},layout:'stereo',conversion:{sampleRate:'reject',layout:'reject'}});return {audio:{...b,startSample:r.local.start}};}}));
export const volume=defineAudioStage<{pcm:import('@frameweave/engine/audio').AudioBlockV1}>({sampleRate:48000,layout:'stereo',durationSamples:48000},()=>({evaluateInterval(r,inputs){const values=audioSamples(inputs.pcm);for(let i=0;i<values.length;i++)values[i]*=.5;return {audio:audioBlock(values,{sampleRate:48000,layout:'stereo',startSample:r.local.start})};}}));
export default <Composition width={1} height={1} fps={{num:30000,den:1001}} durationInFrames={1}><Resource id='music' src='./long.wav' kind='file'/><Stage id='a' factory={source}/><Stage id='b' factory={volume} inputs={{pcm:ref('a','audio')}}/><Layer source={ref('b','audio')} end={1}/></Composition>;`);
  const interval={unit:'samples' as const,sampleRate:rate,start:0,endExclusive:frameToSample(1,rate,{num:30000,den:1001})},session=await openRenderSession(project,{audioResources:{maxCacheBytes:65536}});
  try{const first=await session.evaluateInterval(interval,{stageId:'b'});const outputs=first.stageOutputs.b.audio as AudioBlockV1;const values=audioSamples(outputs);assert.equal(outputs.sampleCount,1601);for(let i=0;i<1601;i++)for(let c=0;c<2;c++)assert.equal(values[i*2+c],sample(60*rate+i,c)*.5);
    const again=await session.evaluateInterval(interval,{stageId:'b'});assert.deepEqual(again.stageOutputs,first.stageOutputs);assert.ok(again.cacheHits>0);
  }finally{await session.close();}
  const output=join(projectDir,'clip.wav');await exportAudioProject({project,output,format:'wav',sampleRate:rate,layout:'stereo',wavFormat:'float32',quantization:{clip:'reject',dither:{kind:'none'}},blockSamples:512});
  const decoded=readWavBlock(new Uint8Array(await readFile(output)));assert.equal(decoded.sampleCount,1601);const values=audioSamples(decoded);for(let i=0;i<1601;i++)for(let c=0;c<2;c++)assert.equal(values[i*2+c],sample(60*rate+i,c)*.5);
  const probe=JSON.parse((await exec(process.env.FRAMEWEAVE_FFPROBE!,['-v','error','-show_entries','stream=codec_name,sample_rate,channels,duration_ts,time_base','-of','json',output],{windowsHide:true,timeout:10000})).stdout);assert.equal(probe.streams[0].sample_rate,'48000');assert.equal(Number(probe.streams[0].duration_ts),1601);await writeFile(join(projectDir,'probe.json'),JSON.stringify(probe,null,2));
  const changed=await openRenderSession(project);try{await changed.evaluateInterval(interval,{stageId:'b'});await appendFile(join(projectDir,'long.wav'),new Uint8Array([0]));await assert.rejects(changed.evaluateInterval(interval,{stageId:'b'}));}finally{await changed.close();}
  // Compile API is kept exercised separately from the direct build fixtures above.
  assert.equal(typeof buildProject,'function');
});
