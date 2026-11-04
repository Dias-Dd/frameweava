import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import * as esbuild from 'esbuild';
import sharp from 'sharp';
import {createAnalysisTask,createNodeAnalysisExecutor} from '../../src/analysis/index.ts';
import type {BrightnessInput,BrightnessOutput} from './brightness-task.ts';

const out=resolve(process.argv[2]??`outputs/analysis-c3/brightness-${Date.now()}`);await mkdir(out,{recursive:true});
const width=64,height=48,pixels=Buffer.alloc(width*height*3);
for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*3;pixels[i]=Math.round(x*255/(width-1));pixels[i+1]=Math.round(y*255/(height-1));pixels[i+2]=(Math.floor(x/8)+Math.floor(y/8))%2?255:0;}
const imagePath=join(out,'image.ppm');await writeFile(imagePath,Buffer.concat([Buffer.from(`P6\n${width} ${height}\n255\n`),pixels]));
// Presentation only; the task itself reads raw P6 and imports no image/browser/model library.
await sharp(pixels,{raw:{width,height,channels:3}}).png().toFile(join(out,'image.png'));
const module=fileURLToPath(new URL('./brightness-task.ts',import.meta.url)),cacheRoot=join(out,'cache');
const executor=createNodeAnalysisExecutor<BrightnessInput,BrightnessOutput>({module,exportName:'brightnessTask',cacheRoot});
const events:unknown[]=[],job=createAnalysisTask({input:{imagePath,batchRows:1},executor});job.subscribe(s=>events.push(s));
const first=await job.start().wait(),warm=await createAnalysisTask({input:{imagePath,batchRows:1},executor}).start().wait();assert.equal(first.cacheHit,false);assert.equal(warm.cacheHit,true);assert.equal(first.output.pixels,3072);assert.ok(Math.abs(first.output.meanLuma-127.5)<1e-8);
const cancelled=createAnalysisTask({input:{imagePath,batchRows:2},executor});cancelled.subscribe(s=>{if(s.phase==='pixels')cancelled.cancel();});await assert.rejects(cancelled.start().wait(),{code:'E_CANCELLED'});
await writeFile(join(out,'bad.ppm'),'not a P6 image');const failed=createAnalysisTask({input:{imagePath:join(out,'bad.ppm')},executor});await assert.rejects(failed.start().wait(),{code:'E_BRIGHTNESS_INPUT'});
const graph=await esbuild.build({entryPoints:[module],bundle:true,write:false,metafile:true,platform:'node',format:'esm',logLevel:'silent'});
assert.ok(!Object.keys(graph.metafile.inputs).some(p=>/mediapipe|playwright|ffmpeg|face-session|render\/renderer/.test(p.replaceAll('\\','/'))));
await writeFile(join(out,'verification.json'),JSON.stringify({passed:true,first,warm:{cacheHit:warm.cacheHit,elapsedMs:warm.elapsedMs},cancelled:cancelled.status(),failed:failed.status(),algorithmDependencies:Object.keys(graph.metafile.inputs),events},null,2));
await writeFile(join(out,'analysis-artifact.json'),JSON.stringify(first.artifact.manifest,null,2));
await writeFile(join(out,'brightness.json'),await readFile(join(first.artifact.directory,'brightness.json')));
console.log(JSON.stringify({passed:true,pixels:first.output.pixels,meanLuma:first.output.meanLuma,cacheHit:warm.cacheHit,output:out}));
