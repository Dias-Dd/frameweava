import test from 'node:test';import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readFile} from 'node:fs/promises';import {resolve,join} from 'node:path';
import {promisify} from 'node:util';import {execFile} from 'node:child_process';
import {buildProject} from '../src/compiler/build.ts';import {Renderer} from '../src/render/renderer.ts';
import {NativeVideoDecoder} from '../modules/native-gpu/video-decoder.ts';
import {linear709,linear2020,pq2020,pixelsFromSurface} from '../src/media/surface.ts';
import {ffmpegPath} from '../src/encoding/ffmpeg.ts';import type {NativeVideoResource} from '../modules/native-gpu/resources.ts';
import {assertSelfContainedMp4} from '../modules/native-gpu/video-container.ts';
const exec=promisify(execFile),native=resolve('.frameweave/native-target/debug/frameweave-native-gpu.exe');
test('real MP4 hardware decoding enters existing float Stage owner, verifies relative PTS, seeks and stays off CPU pixels',async()=>{
 process.env.FRAMEWEAVE_HOME=resolve('.frameweave/user-home');process.env.FRAMEWEAVE_MEDIA_RUNTIME=resolve('.frameweave/native-media/runtime');
 const parent=resolve('artifacts/native-hardware-media');await mkdir(parent,{recursive:true});const dir=await mkdtemp(join(parent,'video-')),raw=join(dir,'source.rgba'),movie=join(dir,'source.mp4'),entry=join(dir,'project.tsx');
 const width=320,height=180,frames=24,data=Buffer.alloc(width*height*frames*4);
 for(let f=0;f<frames;f++)for(let p=0;p<width*height;p++){const i=(f*width*height+p)*4;data[i]=20+f*8;data[i+1]=60+f*3;data[i+2]=190-f*6;data[i+3]=255;}await writeFile(raw,data);
 await exec(ffmpegPath(),['-v','error','-y','-f','rawvideo','-pixel_format','rgba','-s',width+'x'+height,'-framerate','60','-i',raw,'-c:v','libx264','-crf','18','-bf','3','-g','12','-pix_fmt','yuv420p','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709','-color_range','tv',movie],{windowsHide:true});
 await assertSelfContainedMp4(movie);
 const request:NativeVideoResource={version:1,id:'movie',decode:'video',decoder:'hardware',position:{frame:0},boundary:'error',interpretation:{...linear709,transfer:'rec709',reference:'display'},metadataPolicy:'validate',output:{width,height,format:'rgba32float',alpha:'opaque',color:linear709}};
 await writeFile(entry,`import {Composition,Resource,Stage,Layer,ref} from '@frameweave/engine';import {defineNativeStage,type NativeVideoResource} from '@frameweave/engine/native';const request:NativeVideoResource=${JSON.stringify(request)};export const movie=defineNativeStage(init=>({renderAt(c){return init.gpu.importResource({...request,position:{frame:c.frame}});}}));export default <Composition width={320} height={180} fps={60} durationInFrames={24} background="transparent"><Resource id="movie" src="./source.mp4" kind="media"/><Stage id="movie" factory={movie}/><Layer source={ref('movie')}/></Composition>;`);
 const build=await buildProject(entry),reference=await NativeVideoDecoder.create(movie,{...request,decoder:'cpu'}),renderer=await Renderer.create(build,{nativeGpu:{executable:native,slots:1,readback:'final-surface'}});
 let maxError=0;
 try{for(const frame of [0,1,5,2,0,23,3]){const expected=await reference.frame({frame}),actual=pixelsFromSurface(await renderer.renderNativeSurface(frame));for(let i=0;i<actual.length;i++)maxError=Math.max(maxError,Math.abs(actual[i]-expected[i]));assert.ok(maxError<.0002,JSON.stringify({frame,maxError,actual:[...actual.slice(0,4)],expected:[...expected.slice(0,4)]}));}
  const stats=await renderer.nativeStats();assert.equal(stats.hardwareVideo.cpuPixelReadbacks,0);assert.equal(stats.hardwareVideo.cpuPixelUploads,0);assert.equal(stats.resourceImports.uploadBytes,0);assert.equal(stats.devicesCreated,1);console.log(JSON.stringify({case:'native-hardware-video',dir,maxError,stats}));await writeFile(join(dir,'result.json'),JSON.stringify({maxError,stats},null,2));
 }finally{await renderer.close();await reference.close();}
 const batched=await Renderer.create(build,{nativeGpu:{executable:native,dynamic:'throughput',slots:2}});
 try{const tickets=await batched.submitNativeBatch([0,1]);await Promise.all(tickets.map(t=>t.completed));const next=await batched.submitNativeBatch([2,3]);await Promise.all(next.map(t=>t.completed));const stats=await batched.nativeStats();assert.equal(stats.hardwareVideo.requests,4);assert.equal(stats.bufferExports.readbacks,0);assert.equal(stats.resourceImports.uploadBytes,0);assert.ok(stats.frameBindings.slotUpdates>0);console.log(JSON.stringify({case:'native-hardware-video-batch',stats}));}
 finally{await batched.close();}
});
test('hardware MP4 gate rejects external data references before Media Foundation sees them',async()=>{
 const parent=resolve('.frameweave/native-media-container');await mkdir(parent,{recursive:true});const file=join(await mkdtemp(join(parent,'p-')),'external.mp4');
 const box=(type:string,payload:Buffer)=>{const b=Buffer.alloc(8+payload.length);b.writeUInt32BE(b.length);b.write(type,4);payload.copy(b,8);return b;};
 const external=box('url ',Buffer.from([0,0,0,0,...Buffer.from('https://example.invalid/movie\0')]));
 const body=Buffer.alloc(8);body.writeUInt32BE(1,4);
 const dref=box('dref',Buffer.concat([body,external]));const moov=box('moov',box('trak',box('mdia',box('minf',box('dinf',dref)))));
 await writeFile(file,Buffer.concat([box('ftyp',Buffer.from('isom0000')),moov]));await assert.rejects(assertSelfContainedMp4(file),{code:'E_NATIVE_VIDEO_CONTAINER'});
});


test('hardware VFR presentation order and HEVC P010 HDR values survive the existing float Surface boundary',async()=>{
 process.env.FRAMEWEAVE_HOME=resolve('.frameweave/user-home');process.env.FRAMEWEAVE_MEDIA_RUNTIME=resolve('.frameweave/native-media/runtime');
 const root=resolve('artifacts/native-hardware-media');await mkdir(root,{recursive:true});const dir=await mkdtemp(join(root,'formats-'));
 for(const hdr of [false,true]){
  const movie=join(dir,hdr?'pq.mp4':'vfr.mp4'),entry=join(dir,hdr?'pq.tsx':'vfr.tsx');
  await exec(ffmpegPath(),['-v','error','-n','-f','lavfi','-i',hdr?'color=c=0x908060:size=320x180:rate=60':'testsrc2=size=320x180:rate=60','-frames:v','8',...hdr?['-c:v','hevc_nvenc','-qp','12','-profile:v','main10','-pix_fmt','p010le']:['-vf','setpts=(N+floor(N/2))/(60*TB)','-fps_mode','vfr','-enc_time_base','1:60','-c:v','libx264','-bf','2','-pix_fmt','yuv420p'],'-color_primaries',hdr?'bt2020':'bt709','-color_trc',hdr?'smpte2084':'bt709','-colorspace',hdr?'bt2020nc':'bt709','-color_range','tv',movie],{windowsHide:true});
  const req:NativeVideoResource={version:1,id:'movie',decode:'video',decoder:'hardware',position:{frame:0},boundary:'error',metadataPolicy:'validate',interpretation:hdr?pq2020:{...linear709,transfer:'rec709',reference:'display'},output:{width:320,height:180,format:'rgba32float',alpha:'opaque',color:hdr?linear2020:linear709}};
  const position=hdr?'{frame:c.frame}':'{num:c.frame,den:1000}';
  await writeFile(entry,`import {Composition,Resource,Stage,Layer,ref} from '@frameweave/engine';import {defineNativeStage,type NativeVideoResource} from '@frameweave/engine/native';const req:NativeVideoResource=${JSON.stringify(req)};export const movie=defineNativeStage(init=>({renderAt(c){return init.gpu.importResource({...req,position:${position}});}}));export default <Composition width={320} height={180} fps={60} durationInFrames={120} background="transparent"><Resource id="movie" src="./${hdr?'pq.mp4':'vfr.mp4'}" kind="media"/><Stage id="movie" factory={movie}/><Layer source={ref('movie')}/></Composition>;`);
  const build=await buildProject(entry),reference=await NativeVideoDecoder.create(movie,{...req,decoder:'cpu'}),renderer=await Renderer.create(build,{nativeGpu:{executable:native,readback:'final-surface',slots:1}});let maxError=0;
  try{for(const frame of hdr?[0,1,5,2]:[0,40,55,2]){const wanted=hdr?{frame}:{num:frame,den:1000};if(!hdr&&frame===40)assert.equal(reference.frameIndex(wanted),1);const cpu=await reference.frame(wanted),gpu=pixelsFromSurface(await renderer.renderNativeSurface(frame));for(let i=0;i<gpu.length;i++)maxError=Math.max(maxError,Math.abs(gpu[i]-cpu[i]));assert.ok(maxError<(hdr?.0002:.012),JSON.stringify({hdr,frame,maxError}));}await writeFile(join(dir,hdr?'hdr-result.json':'vfr-result.json'),JSON.stringify({maxError,stats:await renderer.nativeStats()},null,2));}finally{await renderer.close();await reference.close();}
 }
});
