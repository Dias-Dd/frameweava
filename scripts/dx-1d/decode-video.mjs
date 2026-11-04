// Independent external decoder; caller supplies a reviewed FFmpeg executable.
import {execFileSync} from 'node:child_process';
import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const [executable,video,directory]=process.argv.slice(2);if(!directory)throw Error('Pass <ffmpeg-executable> <video.mp4> <new-output-directory>');
const output=resolve(directory);await mkdir(output);
let stderr='';try{execFileSync(executable,['-hide_banner','-i',resolve(video),'-map','0:v:0','-f','null','-'],{windowsHide:true,stdio:['ignore','pipe','pipe']});}
catch(e){throw Error('Independent full decode failed: '+String(e.stderr));}
// A separate capture preserves the decoder's metadata and final decoded frame count.
const {spawnSync}=await import('node:child_process'),decoded=spawnSync(executable,['-hide_banner','-i',resolve(video),'-map','0:v:0','-f','null','-'],{windowsHide:true,encoding:'utf8'});assert.equal(decoded.status,0);stderr=decoded.stderr;
const count=Number([...stderr.matchAll(/frame=\s*(\d+)/g)].at(-1)?.[1]);assert.ok(count>0);
const selected=[0,Math.floor((count-1)/2),count-1];
execFileSync(executable,['-v','error','-i',resolve(video),'-vf',selected.map(n=>`select=eq(n\\,${n})`).join('+').replaceAll('+select=','+'),'-vsync','0',join(output,'decoded-%02d.png')],{windowsHide:true});
const files=[];for(const name of (await readdir(output)).filter(n=>n.endsWith('.png'))){const b=await readFile(join(output,name));assert.equal(b.subarray(1,4).toString(),'PNG');files.push({name,width:b.readUInt32BE(16),height:b.readUInt32BE(20),sha256:createHash('sha256').update(b).digest('hex')});}assert.equal(files.length,3);
await writeFile(join(output,'decode-validation.json'),JSON.stringify({decoder:resolve(executable),video:resolve(video),exitCode:decoded.status,decodedFrames:count,selectedFrames:selected,files,stderr,comparison:'Decoded H.264 frames are lossy; no PNG byte-equivalence assertion.'},null,2));console.log(JSON.stringify({decodedFrames:count,selectedFrames:selected,files}));
