import assert from 'node:assert/strict';import {readFile,writeFile} from 'node:fs/promises';import {resolve,join} from 'node:path';import {execFile} from 'node:child_process';import {promisify} from 'node:util';import sharp from 'sharp';
import {buildProject} from '../../../src/compiler/build.ts';import {renderNativeProject} from '../../native-gpu/service.ts';import {nativeExecutable} from '../../native-gpu/executable.ts';import {ffmpegPath} from '../../../src/encoding/ffmpeg.ts';
const out=resolve(process.env.FRAMEWEAVE_AUTHORING_RUN!),save=(n:string,v:unknown)=>writeFile(join(out,n),JSON.stringify(v,null,2)+'\n');let alpha:object|undefined;
try{
 const png=await sharp(await readFile('artifacts/native-effects/authoring-neural/5-media/frame-6.png')).ensureAlpha().raw().toBuffer();let zero=0,full=0,partial=0;for(let i=3;i<png.length;i+=4){zero+=Number(png[i]===0);full+=Number(png[i]===255);partial+=Number(png[i]>0&&png[i]<255);}alpha={zero,full,partial};await save('alpha.json',alpha);
 assert.ok(zero>0&&full>0&&partial>0,'subject example includes removed background, retained foreground and feather edge');
 const entry=resolve('modules/native-effects/authoring/examples/neural.tsx'),build=await buildProject(entry),mp4=join(out,'look.mp4');
 const report=await renderNativeProject(entry,{build,native:await nativeExecutable(),output:mp4,start:0,end:3,encoder:'libx264',maxConcurrency:1});await save('export.json',report);
 const decoded=await promisify(execFile)(ffmpegPath(),['-v','error','-i',mp4,'-f','rawvideo','-pix_fmt','rgba','-'],{windowsHide:true,encoding:'buffer',maxBuffer:16*1024**2});assert.equal(decoded.stdout.length,614*410*4*3);
 await save('result.json',{ok:true,mp4,decodedFrames:3,alpha,scope:'Existing public native service with explicit single-slot resource strategy. Default multi-slot EBUSY failure remains retained/unresolved; no cleanup-error swallowing or trust changes. Lossy SDR H264.'});
}catch(error){await save('result.json',{ok:false,alpha,error:String(error)});throw error;}
