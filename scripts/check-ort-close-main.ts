import {mkdir,mkdtemp,readFile,writeFile,copyFile} from 'node:fs/promises';
import {resolve,join,dirname,relative,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {renderNativeProject} from '../modules/native-gpu/service.ts';
import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import {ffmpegPath} from '../src/encoding/ffmpeg.ts';
import assert from 'node:assert/strict';
const source='D:/frameweave-worktrees/agent-3/artifacts/deliveries/agent3-ort-6171156d',bytes=await readFile(join(source,'receipt.json')),sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
assert.equal(sha(bytes),'eaf27d62b261af4d87230f306ee438d89bc41387be498b1712dd6a974a729bfe');
const receipt=JSON.parse(bytes.toString()),out=resolve('artifacts/main-runtime-unblock');await mkdir(out,{recursive:true});const dir=await mkdtemp(join(out,'ort-'));
for(const entry of receipt.files){const target=resolve(dir,entry.file),rel=relative(dir,target);if(rel.startsWith('..')||isAbsolute(rel))throw Error('Fixture path escapes owned directory');const data=await readFile(join(source,entry.file));assert.equal(data.length,entry.bytes);assert.equal(sha(data),entry.sha256);await mkdir(dirname(target),{recursive:true});await writeFile(target,data);}
await copyFile(join(source,'receipt.json'),join(dir,'receipt.json'));process.env.FRAMEWEAVE_INFERENCE_RUNTIME=join(dir,'runtime');
const output=join(dir,'clip.mp4'),result=await renderNativeProject(join(dir,'core-only.tsx'),{output,start:0,end:3,maxConcurrency:3,initialConcurrency:3,encoder:'libx264',timeoutMs:45000});
assert.equal(result.frames,3);assert.equal(result.stats.inference.runtimeVerified,true);assert.ok(result.stats.inference.models.every((m:any)=>m.runtimeVerified&&m.provider==='directml'&&m.executionProfile.cpuFallback===false));
const raw=await promisify(execFile)(ffmpegPath(),['-v','error','-i',output,'-f','rawvideo','-pix_fmt','rgba','-'],{windowsHide:true,encoding:'buffer',maxBuffer:1024**2,timeout:10000});assert.equal(raw.stdout.length,32*32*4*3);
await writeFile(join(out,'ort.json'),JSON.stringify({output,inputReceiptSha256:sha(bytes),modelSourceCommit:receipt.sourceCommit,slots:3,decodedFrames:3,closeSucceeded:true,inference:result.stats.inference},null,2)+'\n');console.log(JSON.stringify({output,slots:3,closeSucceeded:true,decodedFrames:3}));
