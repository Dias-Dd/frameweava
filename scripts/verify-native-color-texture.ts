import assert from 'node:assert/strict';
import {buildProject,Renderer,ffmpegPath,probeVideo} from '../src/node.ts';
import {nativeExecutable} from '../modules/native-gpu/executable.ts';
import {renderNativeProject} from '../modules/native-gpu/service.ts';
import {resolve} from 'node:path';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import sharp from 'sharp';

const out=resolve('artifacts/main-native-color-texture');await mkdir(out,{recursive:true});
process.env.FRAMEWEAVE_HOME=await mkdtemp(resolve('.frameweave/main-color-texture-'));
const project=resolve('modules/native-gpu/examples/color-texture-v1.tsx'),build=await buildProject(project),executable=await nativeExecutable();
const renderer=await Renderer.create(build,{nativeGpu:{executable,dynamic:'interactive'}}),frames:Float32Array[]=[];
let stats;
try{
 for(const frame of [0,12,23,0]){const ticket=await renderer.submitNativeFrame(frame);const value=await renderer.exportNativeBuffer(ticket,'textured/reference');assert.ok(value.values instanceof Float32Array);frames.push(value.values);}
 assert.deepEqual(frames[0],frames[3]);assert.notDeepEqual(frames[0],frames[1]);
 assert.ok(frames[0].some(v=>v<0));assert.ok(frames[0].some(v=>v>1));
 stats=await renderer.nativeStats();assert.equal(stats.devicesCreated,1);assert.equal(stats.imageReadbacks,0);assert.equal(stats.pixelTransferBytes,0);
}finally{await renderer.close();}
const png=resolve(out,'color-texture.png'),exr=resolve(out,'color-texture.exr'),mp4=resolve(out,'color-texture.mp4');
for(const [output,start,end] of [[png,12,13],[exr,0,1],[mp4,0,6]] as const)await renderNativeProject(project,{build,output,native:executable,start,end,maxConcurrency:2,initialConcurrency:2});
const dimensions=await sharp(png).metadata();assert.equal(dimensions.width,640);assert.equal(dimensions.height,360);
const exec=promisify(execFile),decoded=await exec(ffmpegPath(),['-v','error','-i',exr,'-f','rawvideo','-pix_fmt','gbrapf32le','pipe:1'],{encoding:'buffer',windowsHide:true,maxBuffer:8*1024**2});
const plane=640*360;assert.equal(decoded.stdout.length,plane*16);let maxError=0,min=Infinity,max=-Infinity;
for(let i=0;i<plane;i++)for(let c=0;c<4;c++){const v=decoded.stdout.readFloatLE(((c===0?2:c===1?0:c===2?1:3)*plane+i)*4);assert.ok(Number.isFinite(v));maxError=Math.max(maxError,Math.abs(v-frames[0][i*4+c]));if(c<3){min=Math.min(min,v);max=Math.max(max,v);}}
assert.equal(maxError,0);assert.ok(min<0);assert.ok(max>1);
const probe=await probeVideo(mp4);assert.equal(probe.frames,6);assert.ok(probe.decodable);await exec(ffmpegPath(),['-v','error','-i',mp4,'-f','null','-'],{windowsHide:true});
const result={source:process.env.FRAMEWEAVE_TEST_COMMIT,passed:true,frames:[0,12,23,0],repeatExact:true,stats,png,exr,mp4,exrRange:[min,max],exrMaxError:maxError,probe,performanceClaim:false};
await writeFile(resolve(out,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
