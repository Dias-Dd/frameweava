import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {buildProject,Renderer,VideoEncoder,probeVideo} from '../src/node.ts';
const [entry,expectedFile,output,report]=process.argv.slice(2),expected=JSON.parse(await readFile(expectedFile,'utf8')),built=await buildProject(entry),renderer=await Renderer.create(built,{cache:false}),encoder=await VideoEncoder.create(output,built.manifest.composition.fps,built.manifest.composition.width,built.manifest.composition.height);
try{for(const index of [12,0,23,12]){const frame=await renderer.renderFrame(index);assert.equal(createHash('sha256').update(await sharp(frame.png).ensureAlpha().raw().toBuffer()).digest('hex'),expected[index]);}for(let i=0;i<expected.length;i++){const frame=await renderer.renderFrame(i);assert.deepEqual(frame.diagnostics,[]);assert.equal(createHash('sha256').update(await sharp(frame.png).ensureAlpha().raw().toBuffer()).digest('hex'),expected[i]);await encoder.write(frame.png);}await encoder.finish();}catch(e){await encoder.abort();throw e;}finally{await renderer.close();}
await writeFile(report,JSON.stringify({pass:true,rawFrameComparisons:expected.length,rawPixelTolerance:0,seekFrames:[12,0,23,12],metadata:await probeVideo(output)},null,2));
