// Resume only the failed fixture's unexecuted tail; three real export/raster
// checks in the earlier invocation remain separately recorded in the ledger.
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import assert from 'node:assert/strict';
import {buildProject} from '../src/compiler/build.ts';
import {renderNativeProject} from '../modules/native-gpu/service.ts';
import {ffmpegPath} from '../src/encoding/ffmpeg.ts';
import {execFile} from 'node:child_process';import {promisify} from 'node:util';
const dir=resolve(process.argv[2]);if(!dir.startsWith(resolve('artifacts/main-runtime-unblock')+'/')&&!dir.startsWith(resolve('artifacts/main-runtime-unblock')+'\\'))throw Error('Expected own frozen test fixture');
const invalid=join(dir,'invalid.tsx'),text=await readFile(invalid,'utf8');await writeFile(invalid,text.replace(/width=\{2\} height=\{2\}(?: fps=\{24\})?>/,'width={2} height={2} fps={24} durationInFrames={3}>'));
await assert.rejects(buildProject(invalid),e=>e instanceof Error&&/E_COMPILE|Node|node:|Could not resolve|not available|Unable to resolve/.test(String((e as any).code)+' '+e.message));
const project=join(dir,'project.tsx'),build=await buildProject(project),output=join(dir,'clip-final.mp4'),result=await renderNativeProject(project,{build,native:process.env.FRAMEWEAVE_NATIVE_GPU!,output,start:0,end:3,maxConcurrency:3,initialConcurrency:3,encoder:'libx264'});assert.equal(result.frames,3);
const decoded=await promisify(execFile)(ffmpegPath(),['-v','error','-i',output,'-f','rawvideo','-pix_fmt','rgba','-'],{windowsHide:true,encoding:'buffer',maxBuffer:1024**2,timeout:10000});assert.equal(decoded.stdout.length,48*24*4*3);
await writeFile(resolve('artifacts/main-runtime-unblock/servo.json'),JSON.stringify({project,output,decodedFrames:3,slots:3,originalInputsUnavailable:true,nodePreparationDeniedInsideStage:true,exportsPreviouslyVerified:['flat','capsule','tree'],relativeFlatPreviouslyCompiled:join(dir,'relative-flat.tsx')},null,2)+'\n');console.log(JSON.stringify({ok:true,project,output,decodedFrames:3}));
