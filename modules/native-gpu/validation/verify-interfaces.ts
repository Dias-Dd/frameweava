import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import sharp from 'sharp';
import {buildProject} from '../../../src/compiler/build.ts';
import {Renderer} from '../../../src/render/renderer.ts';
import {renderNativeProject} from '../service.ts';
import {ffmpegPath,probeVideo} from '../../../src/encoding/ffmpeg.ts';
import {NativeBufferExporter,exportedPositions} from '../data-export.ts';
import {residentLayout} from '../memory.ts';
const exec=promisify(execFile),out=resolve('artifacts/native-interfaces/media');await mkdir(out,{recursive:true});process.env.FRAMEWEAVE_HOME=resolve('.frameweave/user-home');
const project=resolve('modules/native-gpu/examples/interfaces-v1.tsx'),debug=resolve('.frameweave/native-target/debug/frameweave-native-gpu.exe'),release=resolve('.frameweave/native-target/release/frameweave-native-gpu.exe');
const build=await buildProject(project),renderer=await Renderer.create(build,{nativeGpu:{executable:debug,dynamic:'interactive'}}),snapshots=[];
try{for(const frame of [0,3,0]){const t=await renderer.submitNativeFrame(frame);await t.completed;const r=renderer as any,p=await r.nativeClient.inspectForTest(t.slot,r.nativePlan.program.passes.at(-1).output);snapshots.push(p.pixels);}assert.deepEqual(snapshots[0],snapshots[2]);assert.notDeepEqual(snapshots[0],snapshots[1]);const stats=await renderer.nativeStats();assert.equal(stats.slots,1);assert.equal(stats.devicesCreated,1);assert.equal(stats.persistentState.buffers,1);assert.equal(stats.bufferExports.readbacks,0);assert.equal(stats.imageReadbacks,0);assert.equal(stats.pixelTransferBytes,0);
 // Reference host integration, intentionally outside authored renderAt. This
 // uses the actual logic host's next packet and the SAME existing GPU owner.
 // It does not implement or claim the pending public Renderer/CLI method.
 const r=renderer as any,exporter=await NativeBufferExporter.create();let positions;
 try{const next=await r.nativeLogic.record(0);next.program.session=r.nativeClient.program.session;next.program.slots=1;next.program.maxBytes=r.nativeClient.program.maxBytes;next.program.imageAllocations=residentLayout(next.program).mapping;exporter.configure(next.program);await r.nativeClient.reconfigure(next.program);const ticket=await r.nativeClient.submit(0,next.parameters);await ticket.completed;positions=exportedPositions(await exporter.read(r.nativeClient,ticket,'mesh/positions'));assert.deepEqual(positions,[[-.59375,-.625,.5],[.40625,-.625,.5],[-.09375,.625,.5]]);}finally{await exporter.close();}
 await writeFile(resolve(out,'random-frame.json'),JSON.stringify({version:1,frames:[0,3,0],repeatExact:true,stats,explicitExportedPositions:positions,exportIntegration:'reference host adapter; public Renderer method pending Main'},null,2)+'\n');}finally{await renderer.close();}
const png=resolve(out,'interfaces.png'),exr=resolve(out,'interfaces.exr'),video=resolve(out,'interfaces.mp4');
await renderNativeProject(project,{output:png,native:release,start:3,end:4,maxConcurrency:1});const info=await sharp(png).metadata();assert.equal(info.width,320);assert.equal(info.height,180);
await renderNativeProject(project,{output:exr,native:release,start:0,end:1,maxConcurrency:1});const raw=await exec(ffmpegPath(),['-v','error','-i',exr,'-f','rawvideo','-pix_fmt','gbrapf32le','pipe:1'],{encoding:'buffer',windowsHide:true,maxBuffer:2*1024**2});let min=Infinity,max=-Infinity;for(let i=0;i<raw.stdout.length;i+=4){const f=raw.stdout.readFloatLE(i);assert.ok(Number.isFinite(f));min=Math.min(min,f);max=Math.max(max,f);}assert.ok(min<0);assert.ok(max>1);
await renderNativeProject(project,{output:video,native:release,start:0,end:4,maxConcurrency:4,initialConcurrency:4});const probe=await probeVideo(video);assert.equal(probe.frames,4);assert.ok(probe.decodable);await exec(ffmpegPath(),['-v','error','-i',video,'-f','null','-'],{windowsHide:true});
const result={version:1,ok:true,png,exr,video,dimensions:[320,180],exrRange:[min,max],probe,note:'Named buffer host export is tested separately; public Renderer/CLI export wiring belongs to Main.'};await writeFile(resolve(out,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
