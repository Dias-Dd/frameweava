import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import sharp from 'sharp';
import {buildProject} from '../../../src/compiler/build.ts';
import {Renderer} from '../../../src/render/renderer.ts';
import {ffmpegPath,probeVideo} from '../../../src/encoding/ffmpeg.ts';
import {renderNativeProject} from '../service.ts';
const exec=promisify(execFile),out=resolve('artifacts/native-color-texture/media');await mkdir(out,{recursive:true});
const project=resolve('modules/native-gpu/examples/color-texture-v1.tsx'),debug=resolve('.frameweave/native-target/debug/frameweave-native-gpu.exe'),release=resolve('.frameweave/native-target/release/frameweave-native-gpu.exe');
const begin=performance.now(),build=await buildProject(project),compileMs=performance.now()-begin,renderer=await Renderer.create(build,{nativeGpu:{executable:debug,dynamic:'interactive'}}),frames:Float32Array[]=[];
try{for(const frame of [0,12,23,0]){const t=await renderer.submitNativeFrame(frame);await t.completed;const p=await renderer.exportNativeBuffer(t,'textured/reference');assert.ok(p.values instanceof Float32Array);frames.push(p.values as Float32Array);}assert.deepEqual(frames[0],frames[3]);assert.notDeepEqual(frames[0],frames[1]);assert.ok(frames[0].some(v=>v<0));assert.ok(frames[0].some(v=>v>1));const stats=await renderer.nativeStats();assert.equal(stats.devicesCreated,1);assert.equal(stats.imageReadbacks,0);assert.equal(stats.pixelTransferBytes,0);await writeFile(resolve(out,'random-frame.json'),JSON.stringify({version:1,frames:[0,12,23,0],exactRepeat:true,stats,compileMs},null,2)+'\n');}finally{await renderer.close();}
const png=resolve(out,'color-texture.png'),exr=resolve(out,'color-texture.exr'),mp4=resolve(out,'color-texture.mp4');
const outputs=[];for(const [path,start,end] of [[png,12,13],[exr,0,1],[mp4,0,6]] as const)outputs.push(await renderNativeProject(project,{build,output:path,native:release,start,end,maxConcurrency:2,initialConcurrency:2}));
const metadata=await sharp(png).metadata();assert.equal(metadata.width,640);assert.equal(metadata.height,360);
const decoded=await exec(ffmpegPath(),['-v','error','-i',exr,'-f','rawvideo','-pix_fmt','gbrapf32le','pipe:1'],{encoding:'buffer',windowsHide:true,maxBuffer:8*1024**2}),plane=640*360;let min=Infinity,max=-Infinity,error=0;
for(let i=0;i<plane;i++)for(let channel=0;channel<4;channel++){const v=decoded.stdout.readFloatLE(((channel===0?2:channel===1?0:channel===2?1:3)*plane+i)*4);assert.ok(Number.isFinite(v));if(channel<3){min=Math.min(min,v);max=Math.max(max,v);}error=Math.max(error,Math.abs(v-frames[0][i*4+channel]));}assert.ok(min<0);assert.ok(max>1);assert.equal(error,0);
const probe=await probeVideo(mp4);assert.equal(probe.frames,6);assert.ok(probe.decodable);await exec(ffmpegPath(),['-v','error','-i',mp4,'-f','null','-'],{windowsHide:true});
const performanceCases=[];
for(const [width,height]of [[1920,1080],[3840,2160]]){
 const started=performance.now(),r=await Renderer.create(build,{width,height,nativeGpu:{executable:release,dynamic:'interactive',slots:1,maxBytes:4*1024**3}}),initMs=performance.now()-started,times=[];let firstMs=0;
 try{for(let frame=0;frame<18;frame++){const at=performance.now(),t=await r.submitNativeFrame(frame);await t.completed;const ms=performance.now()-at;if(frame===0)firstMs=ms;else times.push(ms);}const stats=await r.nativeStats();for(const k of ['imageReadbacks','pixelTransferBytes','frameHashes','numericalValidationPasses','blockingGpuWaits'])assert.equal(stats[k],0);assert.equal(stats.devicesCreated,1);const sorted=[...times].sort((a,b)=>a-b);performanceCases.push({width,height,initMs,firstMs,newFrames:times,medianMs:sorted[Math.floor(sorted.length/2)],p95Ms:sorted[Math.ceil(sorted.length*.95)-1],stats,measurement:'JS/TSX record + control IPC + actual GPU completion; no display, encoding or inspection; one slot; different new frames; concurrent machine load and power state unknown; no old/new optimization A/B claim'});}finally{await r.close();}
}
const summary={version:1,ok:true,compileMs,png,exr,mp4,exrRange:[min,max],exrMaxAbsoluteError:error,probe,outputs,performanceCases};await writeFile(resolve(out,'result.json'),JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify(summary));
