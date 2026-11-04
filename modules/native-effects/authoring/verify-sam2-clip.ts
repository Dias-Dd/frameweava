import assert from 'node:assert/strict';import {writeFile,readFile} from 'node:fs/promises';import {resolve,join} from 'node:path';import {execFile} from 'node:child_process';import {promisify} from 'node:util';import sharp from 'sharp';
import {buildProject} from '../../../src/compiler/build.ts';import {renderNativeProject} from '../../../modules/native-gpu/service.ts';import {nativeExecutable} from '../../../modules/native-gpu/executable.ts';import {ffmpegPath} from '../../../src/encoding/ffmpeg.ts';
const out=resolve(process.env.FRAMEWEAVE_AUTHORING_RUN!),save=(name:string,value:unknown)=>writeFile(join(out,name),JSON.stringify(value,null,2)+'\n');
try{
 const entry=resolve('modules/native-effects/authoring/examples/sam2.tsx'),build=await buildProject(entry),mp4=join(out,'look.mp4');
 const report=await renderNativeProject(entry,{build,native:await nativeExecutable(),output:mp4,start:0,end:3,encoder:'libx264',maxConcurrency:1});await save('export.json',report);
 const decoded=await promisify(execFile)(ffmpegPath(),['-v','error','-i',mp4,'-f','rawvideo','-pix_fmt','rgba','-'],{windowsHide:true,encoding:'buffer',maxBuffer:16*1024**2});assert.equal(decoded.stdout.length,614*410*4*3);
 // The old-baseline PNG already passed precise GPU/EXR comparisons. Reuse its
 // actual Alpha for an independent lossy-delivery comparison, no extra rendering.
 const source=await sharp(await readFile('artifacts/native-effects/authoring-sam2/8-media/frame-0.png')).ensureAlpha().raw().toBuffer();let error=0,fg=0,bg=0,nf=0,nb=0;
 for(let i=0;i<source.length;i+=4){const alpha=source[i+3]/255;for(let c=0;c<3;c++)error+=Math.abs(decoded.stdout[i+c]-source[i+c]*alpha);const luma=(decoded.stdout[i]+decoded.stdout[i+1]+decoded.stdout[i+2])/3;if(alpha>.9){fg+=luma;nf++;}if(alpha===0){bg+=luma;nb++;}}
 const comparison={meanRgbByteError:error/(source.length/4*3),budget:8,foregroundMean:fg/nf,backgroundMean:bg/nb,lossy:true};await save('comparison.json',comparison);assert.ok(comparison.meanRgbByteError<=8);assert.ok(comparison.foregroundMean>20);assert.ok(comparison.backgroundMean<5);
 assert.equal(report.stats.inference.runtimeVerified,true);assert.equal(report.stats.inference.models.length,3);for(const model of report.stats.inference.models){assert.equal(model.runtimeVerified,true);assert.equal(model.executionProfile.cpuFallback,false);}
 await save('result.json',{ok:true,mp4,decodedFrames:3,comparison,closeSucceeded:true,scope:'Same actual TSX SAM2 scene and existing native export service, explicit single slot, corrected Core cleanup. Prior failures/PNG/EXR evidence retained; no retraining or broader package qualification.'});
}catch(error){await save('result.json',{ok:false,error:String(error)});throw error;}
