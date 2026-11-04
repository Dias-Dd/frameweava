import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readFile,access,appendFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import sharp from 'sharp';
import {buildProject} from '../src/compiler/build.ts';
import {Renderer} from '../src/render/renderer.ts';
import {NativeVideoDecoder} from '../modules/native-gpu/video-decoder.ts';
import {NativeResourceImages} from '../modules/native-gpu/resource-images.ts';
import {renderNativeProject} from '../modules/native-gpu/service.ts';
import {ffmpegPath} from '../src/encoding/ffmpeg.ts';
import {inspectMediaFile,decodeVideoFloat} from '../src/media/encoding.ts';
import {surfaceFromPixels,pixelsFromSurface,linear709,linear2020,pq2020,hlg2020} from '../src/media/surface.ts';
import {transformSurface} from '../src/media/color.ts';
import {readExr,ocioTransform} from '../src/media/ocio.ts';
import type {NativeVideoResource} from '../modules/native-gpu/resources.ts';
import type {ProfessionalSettings} from '../src/media/service.ts';
const exec=promisify(execFile),native=resolve('.frameweave/native-target/debug/frameweave-native-gpu.exe');
const hdr10={masteringDisplay:{red:[.708,.292] as [number,number],green:[.17,.797] as [number,number],blue:[.131,.046] as [number,number],white:[.3127,.329] as [number,number],minNits:.005,maxNits:1000},maxCLL:1000,maxFALL:400};
const root=resolve('artifacts/native-media-delivery');
async function directory(prefix:string){await mkdir(root,{recursive:true});return mkdtemp(join(root,prefix));}
const sourceColor={...linear709,transfer:'rec709' as const,reference:'display' as const};
const videoRequest:NativeVideoResource={version:1,id:'movie',decode:'video',decoder:'cpu',position:{frame:0},boundary:'error',interpretation:sourceColor,metadataPolicy:'validate',output:{width:64,height:32,format:'rgba32float',alpha:'opaque',color:linear709},cacheBytes:64*32*16*2};

test('declared video decodes all frames, seeks by PTS, rejects undeclared/tampered inputs, and renders in native Stage',async()=>{
 const dir=await directory('video-'),movie=join(dir,'source.mp4'),raw=join(dir,'source.rgba'),entry=join(dir,'project.tsx');
 const bytes=Buffer.alloc(6*64*32*4);
 for(let f=0;f<6;f++)for(let i=0;i<64*32;i++){const at=(f*64*32+i)*4;bytes[at]=20+f*35;bytes[at+1]=80;bytes[at+2]=150-f*15;bytes[at+3]=255;}
 await writeFile(raw,bytes);
 await exec(ffmpegPath(),['-v','error','-y','-f','rawvideo','-pixel_format','rgba','-video_size','64x32','-framerate','60','-i',raw,'-c:v','libx264','-crf','0','-pix_fmt','yuv420p','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709','-color_range','tv',movie],{windowsHide:true});
 const decoder=await NativeVideoDecoder.create(movie,videoRequest);
 const playlist=join(dir,'untrusted.mp4');await writeFile(playlist,'#EXTM3U\n#EXT-X-TARGETDURATION:1\n#EXTINF:1,\nhttps://example.invalid/undeclared.ts\n');
 await assert.rejects(NativeVideoDecoder.create(playlist,videoRequest),{code:'E_NATIVE_VIDEO_PROBE'});
 await assert.rejects(NativeVideoDecoder.create(movie,videoRequest,AbortSignal.abort()),{code:'E_RENDER_CANCELLED'});
 let reference:Float32Array;
 try{
  for(let f=0;f<6;f++)assert.equal(decoder.frameIndex({num:f,den:60}),f,'Exact rational CFR boundary');
  const zero=await decoder.frame({frame:0});reference=await decoder.frame({frame:3});assert.notDeepEqual(reference,zero);
  assert.deepEqual(await decoder.frame({num:3,den:60}),reference);
  assert.deepEqual(await decoder.frame({frame:0}),zero);
  await assert.rejects(decoder.frame({frame:6}),{code:'E_NATIVE_VIDEO_RANGE'});
  await assert.rejects(decoder.frame({frame:4},AbortSignal.abort()),{code:'E_RENDER_CANCELLED'});
  await decoder.frame({frame:4});assert.ok(decoder.stats.seeks>0);assert.equal(decoder.stats.gpuDirect,false);
  console.log(JSON.stringify({case:'persistent-video',stats:decoder.stats}));
 }finally{await decoder.close();await decoder.close();}
 const loop=await NativeVideoDecoder.create(movie,{...videoRequest,boundary:'loop'});try{assert.equal(loop.frameIndex({frame:7}),1);assert.equal(loop.frameIndex({num:7,den:60}),1);}finally{await loop.close();}
 const vfr=join(dir,'vfr.mkv');
 await exec(ffmpegPath(),['-v','error','-y','-i',movie,'-vf','setpts=(N+floor(N/2))/(60*TB)','-fps_mode','vfr','-enc_time_base','1:60','-c:v','ffv1','-pix_fmt','yuv420p','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709','-color_range','tv',vfr],{windowsHide:true});
 const variable=await NativeVideoDecoder.create(vfr,videoRequest);try{assert.equal(variable.frameIndex({num:40,den:1000}),1);assert.equal(variable.frameIndex({num:55,den:1000}),2);assert.deepEqual(await variable.frame({num:55,den:1000}),await variable.frame({frame:2}));}finally{await variable.close();}
 await writeFile(entry,`import {Composition,Stage,Layer,Resource,ref} from '@frameweave/engine';import {defineNativeStage,linear709,type NativeVideoResource} from '@frameweave/engine/native';
 const request:NativeVideoResource=${JSON.stringify(videoRequest)};
 export const picture=defineNativeStage(init=>({renderAt(c){return init.gpu.importResource({...request,position:{frame:c.frame}});}}));
 export default <Composition width={64} height={32} fps={60} durationInFrames={6} background="transparent"><Resource id="movie" src="./source.mp4" kind="media"/><Stage id="picture" factory={picture}/><Layer source={ref('picture')}/></Composition>;`);
 const build=await buildProject(entry),adapter=await NativeResourceImages.create(build);
 try{await assert.rejects(adapter.image({...videoRequest,id:'absent'}),{code:'E_NATIVE_RESOURCE_UNDECLARED'});await adapter.image(videoRequest);}finally{await adapter.close();await assert.rejects(access(adapter.lease.directory));}
 const renderer=await Renderer.create(build,{nativeGpu:{executable:native,readback:'final-surface',slots:1}});
 try{await renderer.prepareNativeFrame(3);const p=pixelsFromSurface(await renderer.renderNativeSurface(3));assert.deepEqual(p,reference!);assert.deepEqual(pixelsFromSurface(await renderer.renderNativeSurface(0)),pixelsFromSurface(await renderer.renderNativeSurface(0)));}
 finally{await renderer.close();}
 // Exercise frame-local import deltas and two independent in-flight slots.
 const rendered=await renderNativeProject(entry,{build,native,output:join(dir,'roundtrip.mp4'),maxConcurrency:2,encoder:'libx264'});
 const probe=await inspectMediaFile(rendered.output);assert.equal(Number(probe.streams[0].nb_frames),6);
 assert.ok(rendered.stats.frameBindings.slotUpdates>0);
 for(const encoder of ['hevc_nvenc','av1_nvenc'] as const){
  const out=join(dir,'fast-'+encoder+'.mp4');await renderNativeProject(entry,{build,native,width:320,height:160,output:out,start:0,end:2,maxConcurrency:2,encoder});
  const fast=await inspectMediaFile(out),stream=fast.streams[0];assert.equal(stream.codec_name,encoder==='hevc_nvenc'?'hevc':'av1');assert.equal(Number(stream.nb_frames),2);
 }
 const png=join(dir,'native-preview.png'),cli=await exec(process.execPath,['--import','tsx',resolve('src/cli.ts'),'frame',entry,'--native',native,'--frame','3','--output',png,'--json'],{windowsHide:true,maxBuffer:1024*1024});
 assert.equal(JSON.parse(cli.stdout).ok,true);const pngInfo=await sharp(png).metadata();assert.equal(pngInfo.width,64);assert.equal(pngInfo.height,32);
 const fresh=await NativeResourceImages.create(build);await appendFile(build.assets[build.manifest.resources[0].src],'tamper');
 try{await assert.rejects(fresh.image(videoRequest),{code:'E_NATIVE_RESOURCE_INTEGRITY'});}finally{await fresh.close();}
});

test('native float final delivery preserves EXR and produces real 10-bit HEVC/AV1 HDR with metadata and AU-1 audio',async()=>{
 const dir=await directory('hdr-'),entry=join(dir,'project.tsx');
 await writeFile(entry,`import {Composition,Stage,Layer,ref} from '@frameweave/engine';import {defineNativeStage,linear2020} from '@frameweave/engine/native';import {defineAudioStage,generateAudio} from '@frameweave/engine/audio';
 export const picture=defineNativeStage(async init=>{const k=await init.gpu.compile({abiVersion:1,id:'test/hdr-native',version:'1.0.0',inputCount:0,parameterWords:1,code:'fn pixel(p:vec2u)->vec4f{if(paramU32(0u)==1u){return vec4f(-.5,4.,.125,.5);}return vec4f(2.,.5,.125,.5);}'});return{renderAt(c){return init.gpu.run(k,[],{parameters:Uint32Array.of(Number(c.frame===0)),output:{width:init.width,height:init.height,format:"rgba32float",alpha:"straight",color:linear2020}});}};});
 export const sound=defineAudioStage({sampleRate:48000,layout:'mono',durationSamples:5600},()=>({evaluateInterval(r){return{audio:generateAudio(r.local,'mono',({time})=>.1*Math.sin(2*Math.PI*440*time))};}}));
 export default <Composition width={320} height={180} fps={60} durationInFrames={7} background="transparent"><Stage id="picture" factory={picture}/><Stage id="sound" factory={sound}/><Layer source={ref('picture')}/><Layer source={ref('sound','audio')}/></Composition>;`);
 const build=await buildProject(entry),settings:ProfessionalSettings={schemaVersion:1,media:{workingColor:linear2020}};
 const exr=join(dir,'linear.exr');await renderNativeProject(entry,{build,native,professional:settings,output:exr,start:0,end:1});
 const decoded=await readExr(exr),float=pixelsFromSurface(decoded.surface);
 assert.deepEqual([...float.slice(0,4)],[-.25,2,.0625,.5]);assert.equal(decoded.surface.color.primaries,'rec2020');
 const renderer=await Renderer.create(build,{nativeGpu:{executable:native,slots:1}});try{await assert.rejects(renderer.renderNativeSurface(0),{code:'E_NATIVE_DATA_PERMISSION'});}finally{await renderer.close();}
 const reference=transformSurface(surfaceFromPixels(320,180,Float32Array.from({length:320*180*4},(_,i)=>[1,.25,.0625,1][i%4]),{format:'rgba32float',color:linear2020,alpha:'opaque'}),pq2020).surface;
 for(const encoder of ['hevc_nvenc','av1_nvenc'] as const){
  const output=join(dir,encoder+'.mp4');
  const result=await renderNativeProject(entry,{build,native,output,encoder,start:1,end:7,professional:{...settings,video:{preset:'hdr10',outputColor:pq2020,conversion:{kind:'colorimetric',clip:false},alpha:{mode:'flatten',matte:[0,0,0]},hdr10}}});
  assert.equal(result.audio?.sampleCount,4800);
  const probe=await inspectMediaFile(output),stream=probe.streams.find((s:any)=>s.codec_type==='video'),audio=probe.streams.find((s:any)=>s.codec_type==='audio');
  assert.equal(stream.codec_name,encoder==='hevc_nvenc'?'hevc':'av1');assert.equal(stream.pix_fmt,'yuv420p10le');
  assert.equal(Number(stream.nb_frames),6);assert.equal(stream.avg_frame_rate,'60/1');assert.equal(stream.color_primaries,'bt2020');assert.equal(stream.color_transfer,'smpte2084');assert.equal(stream.color_space,'bt2020nc');assert.ok(audio);
  const sides=probe.frames.find((f:any)=>f.media_type==='video').side_data_list;
  const master=sides.find((s:any)=>s.side_data_type==='Mastering display metadata'),cll=sides.find((s:any)=>s.side_data_type==='Content light level metadata');
  assert.ok(master);assert.equal(cll.max_content,1000);assert.equal(cll.max_average,400);
  const fraction=(v:string)=>{const [a,b]=v.split('/').map(Number);return a/b;};assert.ok(Math.abs(fraction(master.red_x)-.708)<1/50000);assert.equal(fraction(master.max_luminance),1000);assert.ok(Math.abs(fraction(master.min_luminance)-.005)<1/16384);
  // The bundled FFmpeg's libaom cannot decode this 10-bit AV1 stream. Validate
  // with an explicitly configured decoder; never silently download/fallback.
  if(encoder==='av1_nvenc')assert.ok(process.env.FRAMEWEAVE_AV1_DECODE_FFMPEG,'Set FRAMEWEAVE_AV1_DECODE_FFMPEG to a reviewed 10-bit AV1 decoder');
  const code=await decodeVideoFloat(output,{color:pq2020,width:320,height:180,ffmpeg:encoder==='av1_nvenc'?process.env.FRAMEWEAVE_AV1_DECODE_FFMPEG:undefined}),a=pixelsFromSurface(code),b=pixelsFromSurface(reference);let maxError=0;
  for(let i=0;i<a.length;i++)maxError=Math.max(maxError,Math.abs(a[i]-b[i]));assert.ok(maxError<.006,JSON.stringify({encoder,maxError}));
  console.log(JSON.stringify({case:'accurate-hdr',encoder,maxCodeError:maxError,master,cll,frames:stream.nb_frames,audio:audio.codec_name,result}));
 }
 // HLG uses the same accurate route, without PQ mastering metadata.
 const output=join(dir,'hlg.mov');await renderNativeProject(entry,{build,native,output,encoder:'hevc_nvenc',start:1,end:7,professional:{...settings,video:{preset:'hlg',outputColor:hlg2020,conversion:{kind:'colorimetric',clip:false},alpha:{mode:'flatten',matte:[0,0,0]}}}});
 const hlg=await inspectMediaFile(output);assert.equal(hlg.streams[0].color_transfer,'arib-std-b67');assert.equal(hlg.streams[0].pix_fmt,'yuv420p10le');
 const transform={source:'Linear Rec.2020',display:'Rec.2100-PQ - Display',view:'ACES 2.0 - HDR 1000 nits (Rec.2020)'};
 const acesOutput=join(dir,'aces2-hevc.mp4'),aces=await renderNativeProject(entry,{build,native,output:acesOutput,encoder:'hevc_nvenc',start:1,end:2,professional:{...settings,video:{preset:'hdr10',outputColor:pq2020,conversion:{kind:'ocio',clip:false,transform},alpha:{mode:'flatten',matte:[0,0,0]},hdr10}}});
 assert.ok('report'in aces&&aces.report?.conversions[0].ocio);
 const linear=surfaceFromPixels(320,180,Float32Array.from({length:320*180*4},(_,i)=>[1,.25,.0625,1][i%4]),{format:'rgba32float',color:linear2020,alpha:'opaque'});
 const cpu=pixelsFromSurface((await ocioTransform(linear,{...transform,outputColor:pq2020})).surface),gpu=pixelsFromSurface(await decodeVideoFloat(acesOutput,{color:pq2020,width:320,height:180}));let maxError=0;for(let i=0;i<cpu.length;i++)maxError=Math.max(maxError,Math.abs(cpu[i]-gpu[i]));assert.ok(maxError<.006);console.log(JSON.stringify({case:'native-aces2-hdr10',maxCodeError:maxError}));
 const config=join(dir,'hdr.json'),cliOutput=join(dir,'cli-av1.mp4');
 await writeFile(config,JSON.stringify({...settings,video:{preset:'hdr10',outputColor:pq2020,conversion:{kind:'colorimetric',clip:false},alpha:{mode:'flatten',matte:[0,0,0]},hdr10}}));
 const cli=await exec(process.execPath,['--import','tsx',resolve('src/cli.ts'),'render',entry,'--native',native,'--settings',config,'--encoder','av1_nvenc','--output',cliOutput,'--from',String(1/60),'--to',String(2/60),'--json'],{windowsHide:true,maxBuffer:1024*1024});
 assert.equal(JSON.parse(cli.stdout).ok,true);assert.equal((await inspectMediaFile(cliOutput)).streams[0].codec_name,'av1');
});
